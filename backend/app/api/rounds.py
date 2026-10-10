import asyncio
import shutil
import tempfile
from pathlib import Path
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import delete, or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.streak import record_streak_activity
from app.api.utils.transcript_route import TranscriptBodyLimitRoute
from app.api.utils.zip_utils import (
    ALLOWED_DOCUMENT_TYPES,
    sanitize_filename,
    store_file,
    validate_file,
)
from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import (
    AuthContext,
    check_api_key_scope,
    get_current_user,
    get_request_time_zone,
    recheck_admitted_auth,
    require_api_key_scope,
    require_api_key_scopes,
)
from app.models import Application, Round, RoundMedia, RoundType, User
from app.schemas.round import RoundCreate, RoundResponse, RoundUpdate
from app.schemas.transcript import (
    MAX_TRANSCRIPT_BYTES,
    CurrentTranscript,
    TranscriptEdit,
    TranscriptPaste,
    TranscriptResponse,
)
from app.services.ai_settings import lock_ai_settings
from app.services.interview_jobs import invalidate_interviews
from app.services.media_intake import (
    intake_slot,
    spool_recording,
    validate_recording,
)
from app.services.round_media import claim_media_generation, remove_media_transcript
from app.services.transcripts import (
    expected_generation,
    owned_round,
    parse_transcript,
    publish_transcript,
)
from app.services.upload_storage import publish_file
from app.services.user_time import RoundTimeZoneConflict, normalize_round_datetime

router = APIRouter(tags=["rounds"], route_class=TranscriptBodyLimitRoute)
settings = get_settings()


from app.services.user_time import get_effective_time_zone_name, normalize_in_zone
from app.services.workspace import audit, change_record, link_contacts


async def get_user_application(
    application_id: str, user: User, db: AsyncSession
) -> Application:
    result = await db.execute(
        select(Application).where(
            Application.id == application_id, Application.user_id == user.id
        )
    )
    application = result.scalars().first()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    return application


@router.post(
    "/api/applications/{application_id}/rounds",
    response_model=RoundResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_round(
    application_id: str,
    data: RoundCreate,
    idempotency_key: UUID | None = Header(default=None),
    expected_round_time_zone: str | None = Header(default=None),
    x_timezone: str | None = Depends(get_request_time_zone),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("rounds:write")),
    db: AsyncSession = Depends(get_db),
):
    await lock_ai_settings(db)
    await get_user_application(application_id, user, db)
    if idempotency_key is not None:
        existing = await db.scalar(
            select(Round)
            .where(Round.id == str(idempotency_key))
            .options(selectinload(Round.round_type), selectinload(Round.media))
        )
        if existing is not None:
            if existing.application_id != application_id:
                raise HTTPException(409, "Round request key is already in use")
            return existing

    result = await db.execute(
        select(RoundType).where(
            RoundType.id == data.round_type_id,
            or_(RoundType.user_id == user.id, RoundType.user_id.is_(None)),
        )
    )
    if not result.scalars().first():
        raise HTTPException(status_code=400, detail="Invalid round type")

    try:
        scheduled_at = (
            normalize_in_zone(data.scheduled_at, data.time_zone)
            if data.time_zone
            else normalize_round_datetime(
                data.scheduled_at,
                user,
                x_timezone=x_timezone,
                expected_time_zone=expected_round_time_zone,
            )
        )
    except RoundTimeZoneConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    extra = data.model_dump(
        exclude={
            "round_type_id",
            "scheduled_at",
            "notes_summary",
            "transcript_summary",
            "contact_ids",
        }
    )
    extra["time_zone"] = data.time_zone or get_effective_time_zone_name(
        user, x_timezone=x_timezone
    )
    extra["completed_at"] = normalize_in_zone(data.completed_at, extra["time_zone"])
    if idempotency_key is not None:
        extra["id"] = str(idempotency_key)
    round = Round(
        **extra,
        application_id=application_id,
        round_type_id=data.round_type_id,
        scheduled_at=scheduled_at,
        notes_summary=data.notes_summary,
        transcript_summary=data.transcript_summary,
    )
    db.add(round)
    await db.flush()
    if data.contact_ids is not None:
        await link_contacts(db, round, user.id, data.contact_ids)
    await audit(db, user.id, "round.created", round)
    await db.commit()
    await db.refresh(round, attribute_names=["contact_links"])
    await record_streak_activity(user=user, db=db, x_timezone=x_timezone)

    result = await db.execute(
        select(Round)
        .where(Round.id == round.id)
        .options(selectinload(Round.round_type), selectinload(Round.media))
    )
    return result.scalars().first()


@router.patch("/api/rounds/{round_id}", response_model=RoundResponse)
async def update_round(
    round_id: str,
    data: RoundUpdate,
    expected_round_time_zone: str | None = Header(default=None),
    x_timezone: str | None = Depends(get_request_time_zone),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("rounds:write")),
    db: AsyncSession = Depends(get_db),
):
    await lock_ai_settings(db)
    result = await db.execute(
        select(Round)
        .join(Application)
        .where(Round.id == round_id, Application.user_id == user.id)
    )
    round = result.scalars().first()

    if not round:
        raise HTTPException(status_code=404, detail="Round not found")

    if data.expected_transcript_generation is not None:
        expected_generation(round, data.expected_transcript_generation)

    if data.round_type_id:
        result = await db.execute(
            select(RoundType).where(
                RoundType.id == data.round_type_id,
                or_(RoundType.user_id == user.id, RoundType.user_id.is_(None)),
            )
        )
        if not result.scalars().first():
            raise HTTPException(status_code=400, detail="Invalid round type")

    update_data = data.model_dump(
        exclude_unset=True,
        exclude={"expected_revision", "expected_transcript_generation", "contact_ids"},
    )
    try:
        for field in ("scheduled_at", "completed_at"):
            if field in update_data:
                update_data[field] = (
                    normalize_in_zone(update_data[field], data.time_zone)
                    if data.time_zone
                    else normalize_round_datetime(
                        update_data[field],
                        user,
                        x_timezone=x_timezone,
                        expected_time_zone=expected_round_time_zone,
                    )
                )
    except RoundTimeZoneConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    from app.services.interview_evidence import ROUND_FIELDS

    relevant = {
        k: v
        for k, v in update_data.items()
        if k in ROUND_FIELDS and v != getattr(round, k)
    }
    if relevant:
        await invalidate_interviews(
            db,
            round_id=round_id,
            removed=any(v is None or v == "" for v in relevant.values()),
        )
    await change_record(
        db,
        round,
        user.id,
        data.expected_revision
        if data.expected_revision is not None
        else round.revision,
        update_data,
    )
    if data.contact_ids is not None:
        await link_contacts(db, round, user.id, data.contact_ids)
    await audit(db, user.id, "round.updated", round)
    await db.commit()
    await db.refresh(round, attribute_names=["contact_links"])
    await record_streak_activity(user=user, db=db, x_timezone=x_timezone)

    result = await db.execute(
        select(Round)
        .where(Round.id == round_id)
        .options(selectinload(Round.round_type), selectinload(Round.media))
    )
    return result.scalars().first()


@router.delete("/api/rounds/{round_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_round(
    round_id: str,
    expected_revision: int | None = Query(default=None, ge=0),
    expected_media_generation: int | None = Header(default=None, ge=0),
    expected_transcript_generation: int | None = Header(default=None, ge=0),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("rounds:write")),
    db: AsyncSession = Depends(get_db),
):
    await lock_ai_settings(db)
    result = await db.execute(
        select(Round)
        .join(Application)
        .where(Round.id == round_id, Application.user_id == user.id)
        .options(selectinload(Round.media))
        .execution_options(populate_existing=True)
    )
    round = result.scalars().first()

    if not round:
        raise HTTPException(status_code=404, detail="Round not found")

    if (
        (expected_revision is not None and expected_revision != round.revision)
        or (
            expected_media_generation is not None
            and expected_media_generation != round.media_generation
        )
        or (
            expected_transcript_generation is not None
            and expected_transcript_generation != round.transcript_generation
        )
    ):
        raise HTTPException(409, "Round changed. Reload and review before deleting.")
    await claim_media_generation(db, round_id, user.id, round.media_generation)
    await db.refresh(round, attribute_names=["media"])
    # Shared CAS blobs are retained for offline maintenance.
    try:
        await db.delete(round)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            409, "Round changed during deletion. Reload and review before retrying"
        ) from None


@router.post(
    "/api/rounds/{round_id}/media",
    response_model=RoundResponse,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["file"],
                        "properties": {"file": {"type": "string", "format": "binary"}},
                        "additionalProperties": False,
                    }
                }
            },
            "description": "One recording, at most 1,000,000,000 bytes and 7,200 seconds; multipart overhead at most 16,384 bytes. Local validation only, no transcription.",
        }
    },
)
async def upload_media(
    round_id: str,
    request: Request,
    expected_media_generation: int | None = Header(default=None, ge=0),
    replace_media_id: str | None = Header(default=None, max_length=36),
    x_timezone: str | None = Depends(get_request_time_zone),
    auth: AuthContext = Depends(require_api_key_scope("files:write")),
    db: AsyncSession = Depends(get_db),
):
    # Capture scalar authority, not mutable ORM state or a token, at admission.
    user = auth.user
    session_version = user.session_version
    api_key_id = auth.api_key.id if auth.api_key is not None else None
    # Request rather than UploadFile is essential: auth/ownership precede body IO.
    round = await owned_round(db, round_id, user.id)
    generation = round.media_generation
    user_id = user.id
    if (
        expected_media_generation is not None
        and expected_media_generation != generation
    ):
        raise HTTPException(
            409, "Recordings changed. Reload and review before retrying"
        )
    if replace_media_id:
        if expected_media_generation is None:
            raise HTTPException(
                428, "Supply Expected-Media-Generation to replace a recording"
            )
        if not await db.scalar(
            select(RoundMedia.id).where(
                RoundMedia.id == replace_media_id, RoundMedia.round_id == round_id
            )
        ):
            raise HTTPException(404, "Recording to replace was not found")
    # Do not retain a read transaction/writer lock while receiving a large body.
    await db.commit()
    upload_root = Path(settings.upload_dir)
    if not shutil.which("ffprobe") or not shutil.which("ffmpeg"):
        raise HTTPException(
            503,
            "Local media validation tools are unavailable. Ask the operator to install FFmpeg/FFprobe",
        )
    try:
        with intake_slot(upload_root) as temporary:
            filename, digest, size = await spool_recording(request, temporary)
            validation = asyncio.create_task(validate_recording(temporary))
            disconnected = asyncio.ensure_future(request.receive())
            try:
                done, _pending = await asyncio.wait(
                    (validation, disconnected), return_when=asyncio.FIRST_COMPLETED
                )
                if (
                    disconnected in done
                    and disconnected.result()["type"] == "http.disconnect"
                ):
                    raise HTTPException(
                        400, "Recording connection closed before validation completed"
                    )
                metadata = await validation
            finally:
                disconnected.cancel()
                validation.cancel()
                cleanup = asyncio.gather(
                    validation, disconnected, return_exceptions=True
                )
                cleanup_cancelled = False
                while not cleanup.done():
                    try:
                        await asyncio.shield(cleanup)
                    except asyncio.CancelledError:
                        cleanup_cancelled = True
                if cleanup_cancelled:
                    raise asyncio.CancelledError
            # Ordinary expiry is not revocation of an already-admitted upload.
            # Fresh account/session/key authority and scope still gate publication.
            auth = await recheck_admitted_auth(db, user_id, session_version, api_key_id)
            check_api_key_scope(auth, "files:write")
            await claim_media_generation(db, round_id, user_id, generation)
            if replace_media_id:
                await remove_media_transcript(db, round_id, replace_media_id)
                deleted = await db.execute(
                    delete(RoundMedia)
                    .where(
                        RoundMedia.id == replace_media_id,
                        RoundMedia.round_id == round_id,
                    )
                    .returning(RoundMedia.id)
                )
                if deleted.scalar_one_or_none() is None:
                    raise HTTPException(
                        409, "Recording was removed. Reload before retrying"
                    )
            file_path = publish_file(temporary, upload_root, digest, metadata.extension)
            db.add(
                RoundMedia(
                    round_id=round_id,
                    file_path=file_path,
                    original_filename=filename,
                    media_type=metadata.media_type,
                    sha256=digest,
                    byte_count=size,
                    probed_duration_seconds=metadata.duration,
                    validation="audio_decode_check",
                )
            )
            await db.commit()
    except OSError as exc:
        await db.rollback()
        raise HTTPException(
            507,
            "Recording storage failed. Check current recordings and ask the operator to check storage before retrying",
        ) from exc
    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(
            409,
            "Recording publication conflicted or storage is unavailable. Reload and review before retrying",
        ) from exc
    except BaseException:
        await db.rollback()
        raise
    await record_streak_activity(user=user, db=db, x_timezone=x_timezone)
    result = await db.execute(
        select(Round)
        .where(Round.id == round_id)
        .options(selectinload(Round.round_type), selectinload(Round.media))
        .execution_options(populate_existing=True)
    )
    return result.scalars().first()


@router.delete("/api/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    media_id: str,
    expected_media_generation: int | None = Header(default=None, ge=0),
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scope("files:write")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RoundMedia, Round.media_generation)
        .join(Round)
        .join(Application)
        .where(RoundMedia.id == media_id, Application.user_id == user.id)
    )
    row = result.first()
    if not row:
        raise HTTPException(404, "Media not found")
    media, generation = row
    if (
        expected_media_generation is not None
        and expected_media_generation != generation
    ):
        raise HTTPException(
            409, "Recordings changed. Reload and review before deleting"
        )
    await claim_media_generation(db, media.round_id, user.id, generation)
    await remove_media_transcript(db, media.round_id, media_id)
    await db.execute(delete(RoundMedia).where(RoundMedia.id == media_id))
    # Independently pasted/uploaded transcripts are not derived from this media.
    # Shared CAS blobs are retained for offline maintenance, not unlinked here.
    await db.commit()


@router.get("/api/rounds/{round_id}/transcript", response_model=TranscriptResponse)
async def read_transcript(
    round_id: str,
    user: User = Depends(get_current_user),
    _: object = Depends(require_api_key_scopes("files:read", "rounds:read")),
    db: AsyncSession = Depends(get_db),
):
    round = await owned_round(db, round_id, user.id)
    return transcript_response(round)


def transcript_response(round: Round) -> TranscriptResponse:
    return TranscriptResponse(
        generation=round.transcript_generation,
        transcript=CurrentTranscript.model_validate(round.current_transcript)
        if round.current_transcript
        else None,
        attachment_only=bool(round.transcript_path and not round.current_transcript),
    )


@router.put("/api/rounds/{round_id}/transcript", response_model=TranscriptResponse)
async def paste_transcript(
    round_id: str,
    data: TranscriptPaste,
    expected_transcript_generation: int = Header(ge=0),
    user: User = Depends(get_current_user),
    _: object = Depends(
        require_api_key_scopes("files:write", "files:read", "rounds:read")
    ),
    db: AsyncSession = Depends(get_db),
):
    round = await owned_round(db, round_id, user.id)
    generation = expected_generation(round, expected_transcript_generation)
    try:
        transcript = parse_transcript(data.text.encode("utf-8"), data.format, "paste")
    except (ValueError, UnicodeError) as exc:
        raise HTTPException(
            422,
            "Invalid transcript. Use nonempty UTF-8 TXT/SRT/VTT within the documented limits",
        ) from exc
    await publish_transcript(
        db,
        round_id,
        user.id,
        generation,
        {
            "current_transcript": transcript.model_dump(),
            "transcript_path": None,
            "transcript_original_filename": None,
        },
    )
    return transcript_response(await owned_round(db, round_id, user.id))


@router.patch("/api/rounds/{round_id}/transcript", response_model=TranscriptResponse)
async def edit_transcript(
    round_id: str,
    data: TranscriptEdit,
    expected_transcript_generation: int = Header(ge=0),
    user: User = Depends(get_current_user),
    _: object = Depends(
        require_api_key_scopes("files:write", "files:read", "rounds:read")
    ),
    db: AsyncSession = Depends(get_db),
):
    round = await owned_round(db, round_id, user.id)
    generation = expected_generation(round, expected_transcript_generation)
    if not round.current_transcript:
        raise HTTPException(
            404, "No editable transcript. Upload or paste TXT/SRT/VTT first"
        )
    transcript = CurrentTranscript.model_validate(round.current_transcript)
    # Corrections retain passage identity/order and genuine source timestamps.
    if [(s.id, s.start, s.end, s.audio_channel) for s in data.segments] != [
        (s.id, s.start, s.end, s.audio_channel) for s in transcript.segments
    ]:
        raise HTTPException(
            422,
            "Corrections must retain segment IDs, order and source timestamps; replace the transcript for new source material",
        )
    transcript.segments = data.segments
    transcript.revision += 1
    await publish_transcript(
        db,
        round_id,
        user.id,
        generation,
        {"current_transcript": transcript.model_dump()},
    )
    return transcript_response(await owned_round(db, round_id, user.id))


@router.post("/api/rounds/{round_id}/transcript", response_model=RoundResponse)
async def upload_transcript(
    round_id: str,
    file: UploadFile,
    expected_transcript_generation: int | None = Header(default=None, ge=0),
    x_timezone: str | None = Depends(get_request_time_zone),
    user: User = Depends(get_current_user),
    auth: AuthContext = Depends(require_api_key_scope("files:write")),
    db: AsyncSession = Depends(get_db),
):
    """TXT/SRT/VTT become editable; existing document formats remain attachments."""
    round = await owned_round(db, round_id, user.id)
    generation = expected_generation(round, expected_transcript_generation)
    legacy = expected_transcript_generation is None
    suffix = Path(file.filename or "").suffix.lower().lstrip(".")
    if suffix not in {"txt", "srt", "vtt", "pdf", "docx", "doc", "md", "rtf"}:
        raise HTTPException(
            422,
            "Unsupported transcript file. Choose TXT, SRT, VTT, PDF, DOCX, DOC, MD or RTF.",
        )
    editable = suffix in ("txt", "srt", "vtt")
    if editable or round.current_transcript:
        check_api_key_scope(auth, "files:read")
        check_api_key_scope(auth, "rounds:read")
    if round.current_transcript and not editable:
        raise HTTPException(
            409,
            "An editable transcript cannot be replaced by an attachment-only format. Delete it explicitly first",
        )
    max_size = (
        MAX_TRANSCRIPT_BYTES
        if editable
        else settings.max_document_size_mb * 1024 * 1024
    )
    content = await file.read(max_size + 1)
    if len(content) > max_size:
        raise HTTPException(413, f"Transcript exceeds {max_size} bytes")
    transcript = None
    if editable:
        try:
            transcript = parse_transcript(content, suffix, "upload").model_dump()
        except (ValueError, UnicodeError) as exc:
            raise HTTPException(
                422,
                "Invalid transcript. Use nonempty UTF-8 TXT/SRT/VTT within the documented limits",
            ) from exc
    else:
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(content)
            tmp_path = Path(tmp.name)
        try:
            valid, _detected_type = validate_file(tmp_path, ALLOWED_DOCUMENT_TYPES)
            if not valid:
                raise HTTPException(400, "Invalid document attachment type")
        finally:
            tmp_path.unlink(missing_ok=True)
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = store_file(content, upload_dir)
    await publish_transcript(
        db,
        round_id,
        user.id,
        generation,
        {
            "current_transcript": transcript,
            "transcript_path": file_path,
            "transcript_original_filename": sanitize_filename(
                file.filename or "unnamed"
            ),
        },
        legacy=legacy,
    )
    await record_streak_activity(user=user, db=db, x_timezone=x_timezone)
    result = await db.execute(
        select(Round)
        .where(Round.id == round_id)
        .options(selectinload(Round.round_type), selectinload(Round.media))
        .execution_options(populate_existing=True)
    )
    return result.scalars().first()


@router.delete(
    "/api/rounds/{round_id}/transcript", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_transcript(
    round_id: str,
    expected_transcript_generation: int | None = Header(default=None, ge=0),
    user: User = Depends(get_current_user),
    auth: AuthContext = Depends(require_api_key_scope("files:write")),
    db: AsyncSession = Depends(get_db),
):
    round = await owned_round(db, round_id, user.id)
    generation = expected_generation(round, expected_transcript_generation)
    if round.current_transcript:
        check_api_key_scope(auth, "files:read")
        check_api_key_scope(auth, "rounds:read")
    # Even empty deletion advances generation, preventing delete/recreate ABA.
    await publish_transcript(
        db,
        round_id,
        user.id,
        generation,
        {
            "current_transcript": None,
            "transcript_path": None,
            "transcript_original_filename": None,
            "transcript_summary": None,
        },
        legacy=expected_transcript_generation is None,
    )
