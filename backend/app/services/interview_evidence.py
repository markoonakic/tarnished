"""Owner SQL evidence, bounded exact passages and content (not timestamp) revisions."""

import hashlib
import json
from collections import Counter
from functools import partial
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import resolve_upload_path
from app.models import Application, ApplicationStatusHistory, Round
from app.services.analytics_queries import (
    ACTIVE_MEANINGS,
    CLOSED_MEANINGS,
    get_pipeline_overview_data,
)
from app.services.media_intake import run_media_process
from app.services.profile_items import legacy_ai_profile

APP_FIELDS = (
    "company",
    "job_title",
    "job_description",
    "requirements_must_have",
    "requirements_nice_to_have",
    "skills",
    "years_experience_min",
    "years_experience_max",
    "status_meaning",
    "status_meaning_provenance",
    "applied_at",
    "source",
    "response_state",
    "response_occurred_on",
    "response_reference",
)
ROUND_FIELDS = (
    "notes_summary",
    "transcript_summary",
    "outcome",
    "scheduled_at",
    "completed_at",
)
PROFILE_FIELDS = ("work_history", "skills")
WORK_HISTORY_FIELDS = ("company", "title", "description", "start_date", "end_date")
HISTORY_FIELDS = (
    "changed_at",
    "note",
    "from_meaning",
    "to_meaning",
    "time_provenance",
    "is_gap",
    "correction_note",
)
MAX_DOCUMENT_BYTES = 10_000_000
MAX_SOURCE_CHARS = 2_300_000


def profile_work_history(value):
    """Select experience fields without passing through imported contact details."""
    if not value:
        return value
    return [
        {key: item[key] for key in WORK_HISTORY_FIELDS if key in item}
        for item in value
        if isinstance(item, dict)
    ]


def fingerprint(value) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, default=str, ensure_ascii=True).encode()
    ).hexdigest()


async def bounded_row(db, model, fields, condition, maximum):
    sizes = (
        await db.execute(
            select(
                *[func.length(cast(getattr(model, f), String)) for f in fields]
            ).where(condition)
        )
    ).first()
    if sizes is not None and sum(n or 0 for n in sizes) > maximum:
        raise HTTPException(
            422,
            "Evidence exceeds analysis bounds; shorten or paste bounded relevant text",
        )
    return (
        (
            await db.execute(
                select(*[getattr(model, f) for f in fields]).where(condition)
            )
        )
        .mappings()
        .first()
    )


async def snapshot(db: AsyncSession, user_id: str, round_id: str):
    """Caller holds the shared mutation lock through reads and retained-text writes."""
    parent = await db.scalar(
        select(Round.application_id)
        .join(Application)
        .where(Round.id == round_id, Application.user_id == user_id)
    )
    if parent is None:
        raise HTTPException(404, "Round not found")
    application = dict(
        await bounded_row(
            db,
            Application,
            APP_FIELDS
            + (
                "cv_path",
                "cover_letter_path",
                "cv_original_filename",
                "cover_letter_original_filename",
                "cv_text",
                "cover_letter_text",
            ),
            Application.id == parent,
            160000,
        )
    )
    round_data = dict(
        await bounded_row(
            db,
            Round,
            ROUND_FIELDS + ("current_transcript",),
            Round.id == round_id,
            4_000_000,
        )
    )
    profile = await legacy_ai_profile(db, user_id)
    count, size = (
        await db.execute(
            select(
                func.count(),
                func.sum(
                    func.length(func.coalesce(ApplicationStatusHistory.note, ""))
                    + func.length(
                        func.coalesce(ApplicationStatusHistory.correction_note, "")
                    )
                ),
            ).where(ApplicationStatusHistory.application_id == parent)
        )
    ).one()
    if count > 200 or (size or 0) > 64000:
        raise HTTPException(
            422, "Application history exceeds interview analysis bounds"
        )
    history = (
        (
            await db.execute(
                select(
                    ApplicationStatusHistory.id,
                    *[getattr(ApplicationStatusHistory, f) for f in HISTORY_FIELDS],
                )
                .where(ApplicationStatusHistory.application_id == parent)
                .order_by(
                    ApplicationStatusHistory.changed_at, ApplicationStatusHistory.id
                )
            )
        )
        .mappings()
        .all()
    )
    docs = {}
    for kind in ("cv", "cover_letter"):
        path = application.pop(kind + "_path")
        filename = application.pop(kind + "_original_filename")
        paste = application.pop(kind + "_text")
        docs[kind] = await _document_state(path, filename, paste)
    if profile and profile["work_history"]:
        profile = dict(profile)
        profile["work_history"] = profile_work_history(profile["work_history"])
    data = {
        "application_id": parent,
        "round_id": round_id,
        "application": application,
        "round": round_data,
        "history": [dict(h) for h in history],
        "profile": dict(profile) if profile else {"work_history": None, "skills": None},
        "documents": docs,
    }
    return data, fingerprint(data)


async def application_snapshot(db: AsyncSession, user_id: str, application_id: str):
    """Whole application scope: one application, its rounds, history and profile.

    Caller holds the shared mutation lock through reads and retained-text writes.
    """
    owned = await db.scalar(
        select(Application.id).where(
            Application.id == application_id, Application.user_id == user_id
        )
    )
    if owned is None:
        raise HTTPException(404, "Application not found")
    application = dict(
        await bounded_row(
            db,
            Application,
            APP_FIELDS
            + (
                "cv_path",
                "cover_letter_path",
                "cv_original_filename",
                "cover_letter_original_filename",
                "cv_text",
                "cover_letter_text",
            ),
            Application.id == application_id,
            160000,
        )
    )
    rounds = []
    rows = (
        (
            await db.execute(
                select(Round.id, *[getattr(Round, f) for f in ROUND_FIELDS])
                .where(Round.application_id == application_id)
                .order_by(Round.created_at, Round.id)
            )
        )
        .mappings()
        .all()
    )
    for row in rows:
        detail = dict(row)
        round_id = detail.pop("id")
        rounds.append(
            {
                "id": round_id,
                **detail,
                "interview_report": await db.scalar(
                    select(Round.interview_report).where(Round.id == round_id)
                ),
            }
        )
    profile = await legacy_ai_profile(db, user_id)
    count, size = (
        await db.execute(
            select(
                func.count(),
                func.sum(
                    func.length(func.coalesce(ApplicationStatusHistory.note, ""))
                    + func.length(
                        func.coalesce(ApplicationStatusHistory.correction_note, "")
                    )
                ),
            ).where(ApplicationStatusHistory.application_id == application_id)
        )
    ).one()
    if count > 200 or (size or 0) > 64000:
        raise HTTPException(422, "Application history exceeds analysis bounds")
    history = (
        (
            await db.execute(
                select(
                    ApplicationStatusHistory.id,
                    *[getattr(ApplicationStatusHistory, f) for f in HISTORY_FIELDS],
                )
                .where(ApplicationStatusHistory.application_id == application_id)
                .order_by(
                    ApplicationStatusHistory.changed_at,
                    ApplicationStatusHistory.id,
                )
            )
        )
        .mappings()
        .all()
    )
    docs = {}
    for kind in ("cv", "cover_letter"):
        path = application.pop(kind + "_path")
        filename = application.pop(kind + "_original_filename")
        paste = application.pop(kind + "_text")
        docs[kind] = await _document_state(path, filename, paste)
    if profile and profile["work_history"]:
        profile = dict(profile)
        profile["work_history"] = profile_work_history(profile["work_history"])
    data = {
        "application_id": application_id,
        "application": application,
        "rounds": rounds,
        "history": [dict(h) for h in history],
        "profile": dict(profile) if profile else {"work_history": None, "skills": None},
        "documents": docs,
    }
    return data, fingerprint(data)


async def pipeline_snapshot(
    db: AsyncSession, user_id: str, period: str, as_of, zone: str
):
    """Pipeline scope: deterministic metrics only, never model arithmetic.

    `as_of` must be a pinned instant (never None). The live 'now' would change the
    metrics on every read, so a caller that passed None would produce a different
    fingerprint each time and a job would invalidate itself.

    The resolved time zone affects cohort membership and day boundaries, so it
    is part of the fingerprint.
    """
    metrics = await get_pipeline_overview_data(
        db, user_id, period, as_of=as_of, time_zone=zone
    )
    # 'current_record_basis.observed_at' is the live read instant, which changes on
    # every call. Replace it with the pinned instant so the fingerprint is stable.
    basis = dict(metrics.get("current_record_basis") or {})
    basis["observed_at"] = metrics.get("scope", {}).get("as_of")
    metrics = {**metrics, "current_record_basis": basis}
    profile = await legacy_ai_profile(db, user_id)
    data = {
        "period": period,
        "as_of": as_of.isoformat() if as_of is not None else None,
        "time_zone": zone,
        "metrics": metrics,
        "profile": dict(profile) if profile else {"work_history": None, "skills": None},
    }
    return data, fingerprint(data)


async def _document_state(path, filename, paste):
    digest = None
    availability = "missing"
    if path:
        try:
            file = Path(resolve_upload_path(path))
            if not 0 < file.stat().st_size <= MAX_DOCUMENT_BYTES:
                availability = "exceeds 10 MB extraction limit; paste text; no OCR"
            else:
                with file.open("rb") as source:
                    digest = hashlib.file_digest(source, "sha256").hexdigest()
                availability = "present"
        except (OSError, ValueError):
            availability = "file unavailable; paste text; no OCR"
    return {
        "path": path,
        "filename": filename,
        "paste": paste,
        "sha256": digest,
        "availability": availability,
    }


def application_sections(sources):
    return _batched(sources, context_kinds=("requirement", "profile"))


def pipeline_sections(sources):
    # Each finding needs a deterministic metric, including record-only batches.
    return _batched(sources, context_kinds=("pipeline_metrics", "profile"))


def _batched(sources, *, context_kinds):
    # Reuse bounded context without rewriting original passage references.
    context = []
    # Later notes/transcript batches still need the round's saved dates and
    # outcome. Prioritize these small original passages within the same bound.
    round_facts = [
        s
        for s in sources
        if s["kind"] == "round"
        and s["id"].endswith((":scheduled_at:0", ":completed_at:0", ":outcome:0"))
    ]
    for source in round_facts + [s for s in sources if s["kind"] in context_kinds]:
        if sum(len(s["text"]) for s in context) + len(source["text"]) <= 12000:
            context.append(source)
    batches = []
    batch = []
    size = 0
    for source in sources:
        if size + len(source["text"]) > 24000 or len(batch) >= 100:
            batches.append(batch)
            batch, size = [], 0
        batch.append(source)
        size += len(source["text"])
    if batch:
        batches.append(batch)
    if len(batches) > 128:
        raise HTTPException(422, "Evidence exceeds 128 analysis sections")
    return [batch + [s for s in context if s not in batch] for batch in batches]


def _append_source(sources, source_id, kind, text, **metadata):
    if text is None or text == "" or text == []:
        return
    if not isinstance(text, str):
        text = json.dumps(text, default=str, ensure_ascii=False)
    for offset in range(0, len(text), 4000):
        sources.append(
            {
                "id": f"{source_id}:{offset}",
                "kind": kind,
                "text": text[offset : offset + 4000],
                "offset": offset,
                **metadata,
            }
        )


async def application_evidence_sources(data, *, include_round_reports=True):
    sources = []
    limits = [
        "One application, not a causal explanation of an employer decision. Current documents are not historical submission evidence.",
        "Only saved text is sent; no audio, contact fields, tools or whole-account history.",
    ]
    add = partial(_append_source, sources)

    for field, value in data["application"].items():
        add(
            f"application:{data['application_id']}:{field}",
            "requirement"
            if field.startswith("requirements_") or field == "job_description"
            else "application",
            value,
        )
    for h in data["history"]:
        add(f"history:{h['id']}", "history", {k: v for k, v in h.items() if k != "id"})
    for round_row in data["rounds"]:
        round_id = round_row["id"]
        for field in ROUND_FIELDS:
            add(f"round:{round_id}:{field}", "round", round_row[field])
        report = round_row.get("interview_report")
        if include_round_reports and report:
            limits.append(
                "Round interview findings are prior model output, not verified fact."
            )
            add(
                f"round:{round_id}:interview_findings",
                "round",
                {
                    "findings": [
                        {
                            "observation": f["observation"],
                            "interpretation": f["interpretation"],
                            "action": f["action"],
                            "limitations": f["limitations"],
                        }
                        for f in report.get("findings", [])
                    ],
                    "limitations": report.get("limitations", []),
                    "run_at": report.get("run_at"),
                },
            )
    for field, value in data["profile"].items():
        if field == "work_history":
            value = profile_work_history(value)
        add(f"profile:{field}", "profile", value)
    if not data["profile"] or not data["profile"].get("work_history"):
        limits.append("No recorded profile experience; do not invent an achievement.")
    for kind, doc in data["documents"].items():
        text, limit = await document_text(doc)
        limits.append(f"{kind}: {limit}")
        add(f"document:{data['application_id']}:{kind}", kind, text)
    if len(sources) > 10000 or sum(len(s["text"]) for s in sources) > MAX_SOURCE_CHARS:
        raise HTTPException(422, "Evidence exceeds bounded analysis size")
    return sources, limits


async def pipeline_evidence_sources(data):
    metrics = data["metrics"]
    sources = []
    limits = [
        "Deterministic metrics computed by the application; this report must not recompute them.",
        "Cohort is selected by applied date. Recorded factors are not causal and employer motives are unknown.",
        "Small samples and missing history are marked in coverage; do not present a comparison as a proven difference.",
    ]
    add = partial(_append_source, sources)

    summary = {
        key: metrics.get(key)
        for key in (
            "scope",
            "current_record_basis",
            "total_applications",
            "responded",
            "response_rate",
            "response_unknown",
            "response_undated",
            "response_not_recorded_as_of",
            "interviews",
            "offers",
            "interview_rate",
            "offer_rate",
            "active_applications",
            "closed_applications",
            "unknown_applications",
            "current_stage_breakdown",
            "stage_breakdown",
            "coverage",
        )
    }
    summary["active_stages"] = sorted(ACTIVE_MEANINGS)
    summary["closed_stages"] = sorted(CLOSED_MEANINGS)
    add("pipeline:metrics", "pipeline_metrics", summary)
    add(
        "pipeline:stage_totals",
        "pipeline_metrics",
        {
            "basis": "Cumulative measured hours per application and stage, including current visits. Not completed-visit averages or employer response speed.",
            "stage_totals": metrics.get("stage_totals", []),
        },
    )
    approaches = [
        {
            "application_id": app.get("application_id"),
            "company": app.get("company"),
            "role": app.get("job_title"),
            "source": app.get("source"),
            "current_stage": app.get("current_meaning"),
            "stage_at_report_date": app.get("as_of_meaning"),
            "applied_at": app.get("applied_at"),
            "history_incomplete": bool(
                app.get("missing_prefix", True)
                or app.get("gap_ids")
                or app.get("unknown_history_ids")
                or app.get("ambiguous_time_ids")
            ),
        }
        for app in (metrics.get("applications") or [])
    ]
    add("pipeline:recorded_approaches", "pipeline_record", {"applications": approaches})
    by_source: dict[str | None, Counter[str]] = {}
    for application in approaches:
        stages = by_source.setdefault(application["source"], Counter())
        stages[application["current_stage"] or "unknown"] += 1
    add(
        "pipeline:source_summary",
        "pipeline_metrics",
        {
            "basis": "Current stage counts by recorded source, not historical conversion rates. Missing sources remain unknown.",
            "sources": [
                {
                    "source": source,
                    "applications": sum(stages.values()),
                    "current_stages": dict(stages),
                }
                for source, stages in by_source.items()
            ],
        },
    )
    rounds = [
        {
            "application_id": r.get("application_id"),
            "round_type": r.get("round_type"),
            "outcome": r.get("outcome"),
            "scheduled_at": r.get("scheduled_at"),
            "completed_at": r.get("completed_at"),
        }
        for r in (metrics.get("rounds") or [])
    ]
    add("pipeline:rounds", "pipeline_record", {"rounds": rounds})
    if not data["profile"] or not data["profile"].get("work_history"):
        limits.append("No recorded profile experience; do not invent an achievement.")
    add(
        "profile:work_history",
        "profile",
        profile_work_history(data["profile"].get("work_history")),
    )
    add("profile:skills", "profile", data["profile"].get("skills"))
    if len(sources) > 10000 or sum(len(s["text"]) for s in sources) > MAX_SOURCE_CHARS:
        raise HTTPException(422, "Evidence exceeds bounded analysis size")
    return sources, limits


async def document_text(document):
    if document["paste"]:
        return (
            document["paste"],
            "Current pasted text; not verified against the attachment or historical submission",
        )
    if document["availability"] != "present":
        return "", document["availability"]
    path = Path(resolve_upload_path(document["path"]))
    suffix = Path(document["filename"] or "").suffix.lower()
    try:
        if suffix == ".txt":
            with path.open("rb") as source:
                content = source.read(64001)
            if len(content) > 64000:
                raise ValueError()
            text = content.decode("utf-8-sig")
        elif suffix == ".docx":
            text = (await run_media_process("document_docx", path)).decode("utf-8")
        elif suffix == ".pdf":
            info = (await run_media_process("document_pdfinfo", path)).decode("utf-8")
            pages = int(
                next(
                    line.split(":", 1)[1]
                    for line in info.splitlines()
                    if line.startswith("Pages:")
                )
            )
            if not 0 < pages <= 50:
                raise ValueError()
            parts = []
            for page in range(1, pages + 1):
                parts.append(
                    (await run_media_process("document_pdf", path, str(page))).decode(
                        "utf-8"
                    )
                )
                if sum(map(len, parts)) > 32000:
                    raise ValueError()
            text = "\n".join(parts)
        else:
            return "", "Unsupported document text format; paste text; no OCR"
        if not text.strip() or "\x00" in text or len(text) > 32000:
            raise ValueError()
        return (
            text,
            "Current extracted text, not historical submission evidence; no OCR; PDF ≤50 pages, text ≤32,000 characters",
        )
    except (HTTPException, OSError, ValueError, StopIteration, UnicodeError):
        return (
            "",
            "Text unavailable: parser absent, corrupt/image-only or extraction bound exceeded. Paste text; no OCR",
        )


async def evidence_sources(data):
    sources = []
    limits = [
        "Single recorded interview, not a causal explanation of an employer decision. Current documents are not historical submission evidence.",
        "Only saved text is sent; no audio, contact fields, tools or whole-account history. Unknown speaker passages cannot support candidate findings.",
    ]
    add = partial(_append_source, sources)

    for field, value in data["application"].items():
        add(
            f"application:{data['application_id']}:{field}",
            "requirement"
            if field.startswith("requirements_") or field == "job_description"
            else "application",
            value,
        )
    for field in ROUND_FIELDS:
        add(f"round:{data['round_id']}:{field}", "round", data["round"][field])
    transcript = data["round"].get("current_transcript")
    if transcript:
        limits.append(
            f"Transcript coverage: {transcript['coverage']}; speech accuracy is not verified."
        )
        for segment in transcript["segments"]:
            add(
                f"transcript:{segment['id']}",
                "transcript",
                segment["text"],
                segment_id=segment["id"],
                role=segment["role"],
                start=segment.get("start"),
                end=segment.get("end"),
            )
    else:
        limits.append(
            "No normalized transcript; candidate-specific feedback is unavailable. Add text and assign speaker roles."
        )
    for h in data["history"]:
        add(f"history:{h['id']}", "history", {k: v for k, v in h.items() if k != "id"})
    for field, value in data["profile"].items():
        if field == "work_history":
            value = profile_work_history(value)
        add(f"profile:{field}", "profile", value)
    if not data["profile"] or not data["profile"].get("work_history"):
        limits.append("No recorded profile experience; do not invent an achievement.")
    for kind, doc in data["documents"].items():
        text, limit = await document_text(doc)
        limits.append(f"{kind}: {limit}")
        add(f"document:{data['application_id']}:{kind}", kind, text)
    if len(sources) > 10000 or sum(len(s["text"]) for s in sources) > MAX_SOURCE_CHARS:
        raise HTTPException(422, "Evidence exceeds bounded interview analysis size")
    return sources, limits


def sections(sources):
    return _batched(sources, context_kinds=("requirement", "profile"))
