"""Bounded durable reports for the interview, application and pipeline scopes.

One shared job table, one lifecycle, one bounded executor. Scope selects the
target (round / application / account) and the evidence builder, not the
scheduling, authorization or checkpoint machinery.
"""

import asyncio
import json
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import func, select, update

from app.core.deps import check_api_key_scope, recheck_admitted_auth
from app.models import Application, InterviewJob, ProcessingJob, Round, User, UserAPIKey
from app.services.ai_settings import get_ai_settings, lock_ai_settings
from app.services.analytics_queries import analytics_clock
from app.services.interview_evidence import (
    application_evidence_sources,
    application_sections,
    application_snapshot,
    evidence_sources,
    fingerprint,
    pipeline_evidence_sources,
    pipeline_sections,
    pipeline_snapshot,
    sections,
    snapshot,
)
from app.services.interview_text import (
    SAFE_FAILURE_MESSAGES,
    ReportFailure,
    SectionValidationError,
    ValidationRule,
    analyze_section,
    finding_citations,
    log_validation_failure,
    prompt_revision,
    supported,
    validate_section,
    validation_context,
)

READ_SCOPES = [
    "analytics:read",
    "applications:read",
    "rounds:read",
    "files:read",
    "profile:read",
]
SCOPES = [*READ_SCOPES, "analytics:generate"]
ACTIVE = ("queued", "analyzing")
# Scope-specific wording only; no scope changes the bounded lifecycle below.
MESSAGES = {
    "INTERVIEW": {
        "stale": "evidence changed; rerun required",
        "cleared": "source-removed; rerun required",
        "unsupported_config": (
            "Interview analysis requires enabled openai/ text model, explicit endpoint "
            "and credential or deliberate keyless configuration"
        ),
        "guard": "Interview source, destination or configuration changed",
        "incomplete": "Interview analysis has incomplete coverage",
        "already_active": "Interview analysis is already active",
        "intent": "Intent belongs to another round",
    },
    "APPLICATION": {
        "stale": "application evidence changed; rerun required",
        "cleared": "source-removed; rerun required",
        "unsupported_config": (
            "Application feedback requires enabled openai/ text model, explicit endpoint "
            "and credential or deliberate keyless configuration"
        ),
        "guard": "Application evidence, destination or configuration changed",
        "incomplete": "Application analysis has incomplete coverage",
        "already_active": "Application analysis is already active",
        "intent": "Intent belongs to another application",
    },
    "PIPELINE": {
        "stale": "pipeline evidence changed; rerun required",
        "cleared": "source-removed; rerun required",
        "unsupported_config": (
            "Pipeline feedback requires enabled openai/ text model, explicit endpoint "
            "and credential or deliberate keyless configuration"
        ),
        "guard": "Pipeline evidence, destination or configuration changed",
        "incomplete": "Pipeline analysis has incomplete coverage",
        "already_active": "Pipeline analysis is already active",
        "intent": "Intent belongs to another user",
    },
}


async def _affected_user(db, *, application_id=None, round_id=None, user_id=None):
    """Resolve the owner for application/round conditions; never trust the caller."""
    if user_id:
        return user_id
    if round_id:
        return await db.scalar(
            select(Application.user_id)
            .join(Round, Round.application_id == Application.id)
            .where(Round.id == round_id)
        )
    if application_id:
        return await db.scalar(
            select(Application.user_id).where(Application.id == application_id)
        )
    return None


async def invalidate_reports(
    db,
    *,
    application_id=None,
    round_id=None,
    user_id=None,
    removed=False,
    analysis_removed=True,
):
    """Invalidate affected reports while the caller holds the settings write lock."""
    owner = await _affected_user(
        db, application_id=application_id, round_id=round_id, user_id=user_id
    )
    if owner is None:
        return
    round_condition = (
        Round.id == round_id
        if round_id
        else Round.application_id == application_id
        if application_id
        else Round.application_id.in_(
            select(Application.id).where(Application.user_id == owner)
        )
    )
    if removed and user_id and not application_id and not round_id:
        from app.models.job_analysis import JobAnalysis

        if analysis_removed:
            await db.execute(
                update(JobAnalysis)
                .where(JobAnalysis.user_id == owner, JobAnalysis.kind != "EXTRACTION")
                .values(draft={}, fingerprint="")
            )
        await db.execute(
            update(InterviewJob)
            .where(
                InterviewJob.user_id == owner,
                InterviewJob.analysis_id.is_not(None),
                InterviewJob.scope != "EXTRACTION",
                InterviewJob.state.in_(ACTIVE),
            )
            .values(state="invalidated", manifest={}, checkpoints=[], claim_id=None)
        )
    # INTERVIEW reports live per round.
    await db.execute(
        update(InterviewJob)
        .where(
            InterviewJob.round_id.in_(select(Round.id).where(round_condition)),
            InterviewJob.scope == "INTERVIEW",
        )
        .values(
            state="invalidated",
            claim_id=None,
            checkpoints=[],
            manifest={},
            error=MESSAGES["INTERVIEW"]["cleared"]
            if removed
            else MESSAGES["INTERVIEW"]["stale"],
        )
    )
    interview_values = {
        "interview_generation": Round.interview_generation + 1,
        "interview_report_reason": MESSAGES["INTERVIEW"]["cleared"]
        if removed
        else MESSAGES["INTERVIEW"]["stale"],
    }
    if removed:
        interview_values["interview_report"] = None
    if user_id and not application_id and not round_id:
        interview_values["updated_at"] = Round.updated_at
    await db.execute(
        update(Round)
        .where(round_condition)
        .values(**interview_values)
        .execution_options(synchronize_session=False)
    )
    # APPLICATION reports live per application and only depend on that
    # application's own evidence, so the condition is kept precise.
    if application_id:
        app_condition = [Application.id == application_id]
    elif round_id:
        app_condition = [
            Application.id
            == select(Round.application_id)
            .where(Round.id == round_id)
            .scalar_subquery()
        ]
    else:
        app_condition = [Application.user_id == owner]
    await db.execute(
        update(InterviewJob)
        .where(
            InterviewJob.application_id.in_(
                select(Application.id).where(*app_condition)
            ),
            InterviewJob.scope == "APPLICATION",
        )
        .values(
            state="invalidated",
            claim_id=None,
            checkpoints=[],
            manifest={},
            error=MESSAGES["APPLICATION"]["cleared"]
            if removed
            else MESSAGES["APPLICATION"]["stale"],
        )
    )
    application_values = {
        "report_generation": Application.report_generation + 1,
        "report_reason": MESSAGES["APPLICATION"]["cleared"]
        if removed
        else MESSAGES["APPLICATION"]["stale"],
    }
    if removed:
        application_values["report"] = None
    if user_id and not application_id and not round_id:
        # Profile/privacy changes are not activity on every application.
        application_values["updated_at"] = Application.updated_at
    await db.execute(
        update(Application)
        .where(*app_condition)
        .values(**application_values)
        .execution_options(synchronize_session=False)
    )
    # PIPELINE reports live per account and any owned source change matters.
    await db.execute(
        update(InterviewJob)
        .where(InterviewJob.user_id == owner, InterviewJob.scope == "PIPELINE")
        .values(
            state="invalidated",
            claim_id=None,
            checkpoints=[],
            manifest={},
            error=MESSAGES["PIPELINE"]["cleared"]
            if removed
            else MESSAGES["PIPELINE"]["stale"],
        )
    )
    pipeline_values = {
        "pipeline_generation": User.pipeline_generation + 1,
        "pipeline_report_reason": MESSAGES["PIPELINE"]["cleared"]
        if removed
        else MESSAGES["PIPELINE"]["stale"],
    }
    if removed:
        pipeline_values["pipeline_report"] = None
    await db.execute(update(User).where(User.id == owner).values(**pipeline_values))


async def queue_count(db):
    speech = (
        await db.execute(
            select(func.count())
            .select_from(ProcessingJob)
            .where(ProcessingJob.state.in_(("queued", "preparing", "transcribing")))
        )
    ).scalar_one()
    text = (
        await db.execute(
            select(func.count())
            .select_from(InterviewJob)
            .where(InterviewJob.state.in_(ACTIVE))
        )
    ).scalar_one()
    return speech + text


async def authority(db, user_id, version, key_id, scopes=SCOPES):
    await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(session_version=User.session_version)
    )
    if key_id:
        await db.execute(
            update(UserAPIKey)
            .where(UserAPIKey.id == key_id)
            .values(revoked_at=UserAPIKey.revoked_at)
        )
    auth = await recheck_admitted_auth(db, user_id, version, key_id)
    for scope in scopes:
        check_api_key_scope(auth, scope)
    return auth


async def _pinned_as_of(value):
    """Manifest stores an ISO string; accept a string or a real datetime."""
    if not value:
        return None
    if isinstance(value, str):
        return datetime.fromisoformat(value)
    return value


async def _target(db, job):
    """Return (data, digest, generation) for the job's scope."""
    if job.scope == "INTERVIEW":
        if job.round_id is None:
            raise HTTPException(409, "Report request has no round target")
        data, digest = await snapshot(db, job.user_id, job.round_id)
        generation = await db.scalar(
            select(Round.interview_generation).where(Round.id == job.round_id)
        )
        return data, digest, generation
    if job.scope == "APPLICATION":
        if job.application_id is None:
            raise HTTPException(409, "Report request has no application target")
        data, digest = await application_snapshot(db, job.user_id, job.application_id)
        generation = await db.scalar(
            select(Application.report_generation).where(
                Application.id == job.application_id
            )
        )
        return data, digest, generation
    if job.scope == "PIPELINE":
        period = (job.manifest or {}).get("period", "30d")
        zone = (job.manifest or {}).get("time_zone")
        if not zone:
            raise HTTPException(409, "Report request has no resolved time zone")
        as_of = await _pinned_as_of((job.manifest or {}).get("as_of"))
        data, digest = await pipeline_snapshot(db, job.user_id, period, as_of, zone)
        generation = await db.scalar(
            select(User.pipeline_generation).where(User.id == job.user_id)
        )
        return data, digest, generation
    raise HTTPException(409, "Unsupported report scope")


def _stale_reason_code(reason):
    if not reason:
        return None
    if reason.startswith("pipeline scope or text configuration changed"):
        return "scope_changed"
    if reason.startswith("feedback prompt version unknown"):
        return "prompt_unknown"
    if reason.startswith("feedback prompt changed"):
        return "prompt_changed"
    return "evidence_changed"


def _prompt_stale_reason(metadata, scope):
    revision = metadata.get("prompt_revision")
    if not revision:
        return "feedback prompt version unknown; update explicitly to use current instructions"
    if revision != prompt_revision(scope):
        return "feedback prompt changed; update explicitly to use current instructions"
    return None


async def guard(db, job_id, claim, states=ACTIVE):
    await lock_ai_settings(db)
    job = await db.scalar(
        select(InterviewJob)
        .where(InterviewJob.id == job_id)
        .execution_options(populate_existing=True)
    )
    if job is not None and job.analysis_id:
        from app.services.job_analyses import guard as analysis_guard

        return await analysis_guard(db, job, claim, states)
    if (
        job is None
        or job.claim_id != claim
        or job.state not in states
        or job.required_scopes != SCOPES
        or job.scope not in MESSAGES
    ):
        raise HTTPException(409, "Report request is no longer current")
    await authority(db, job.user_id, job.session_version, job.api_key_id)
    if reason := _prompt_stale_reason(job.manifest or {}, job.scope):
        raise HTTPException(409, reason)
    data, digest, generation = await _target(db, job)
    settings = await get_ai_settings(db)
    if (
        generation != job.generation
        or digest != job.fingerprint
        or settings.revision != job.config_revision
        or not supported(settings)
    ):
        raise HTTPException(409, MESSAGES[job.scope]["guard"])
    return job, data, settings


async def start(
    db, auth, scope, request, *, round_id=None, application_id=None, x_timezone=None
):
    messages = MESSAGES[scope]
    await lock_ai_settings(db)
    await authority(
        db,
        auth.user.id,
        auth.user.session_version,
        auth.api_key.id if auth.api_key else None,
    )
    old = await db.scalar(
        select(InterviewJob).where(
            InterviewJob.user_id == auth.user.id,
            InterviewJob.intent_id == str(request.intent_id),
        )
    )
    if old:
        if (
            old.scope != scope
            or old.round_id != round_id
            or old.application_id != application_id
        ):
            raise HTTPException(409, messages["intent"])
        return old
    manifest = {}
    if scope == "INTERVIEW":
        if round_id is None:
            raise HTTPException(422, "A round is required for interview feedback")
        data, digest = await snapshot(db, auth.user.id, round_id)
        target = {"round_id": round_id}
        generation = await db.scalar(
            select(Round.interview_generation).where(Round.id == round_id)
        )
        manifest = {
            "application_id": data["application_id"],
            "source_media_id": (data["round"].get("current_transcript") or {}).get(
                "source_media_id"
            ),
            "transcript_generation": await db.scalar(
                select(Round.transcript_generation).where(Round.id == round_id)
            ),
        }
    elif scope == "APPLICATION":
        if application_id is None:
            raise HTTPException(
                422, "An application is required for application feedback"
            )
        data, digest = await application_snapshot(db, auth.user.id, application_id)
        target = {"application_id": application_id}
        generation = await db.scalar(
            select(Application.report_generation).where(
                Application.id == application_id
            )
        )
    else:
        period = request.period
        # Pin the analytics instant and zone; a zone change invalidates the report.
        pinned, zone = analytics_clock(auth.user, x_timezone, request.as_of)
        data, digest = await pipeline_snapshot(db, auth.user.id, period, pinned, zone)
        target = {}
        generation = await db.scalar(
            select(User.pipeline_generation).where(User.id == auth.user.id)
        )
        manifest = {"period": period, "as_of": data["as_of"], "time_zone": zone}
    settings = await get_ai_settings(db)
    if not supported(settings):
        raise HTTPException(503, messages["unsupported_config"])
    if request.config_revision != settings.revision:
        raise HTTPException(
            409, "Configuration changed; reload disclosure before requesting"
        )
    if scope != "PIPELINE" and request.generation != generation:
        raise HTTPException(
            409, "Evidence changed; reload disclosure before requesting"
        )
    if await db.scalar(
        select(InterviewJob.id).where(
            InterviewJob.user_id == auth.user.id,
            InterviewJob.scope == scope,
            InterviewJob.state.in_(ACTIVE),
            *(
                (InterviewJob.round_id == round_id,)
                if round_id
                else (InterviewJob.application_id == application_id,)
                if application_id
                else ()
            ),
        )
    ):
        raise HTTPException(409, messages["already_active"])
    if await queue_count(db) >= 16:
        raise HTTPException(503, "Processing queue is full")
    job = InterviewJob(
        user_id=auth.user.id,
        scope=scope,
        intent_id=str(request.intent_id),
        generation=generation,
        fingerprint=digest,
        manifest={
            "fingerprint": digest,
            "prompt_revision": prompt_revision(scope),
            "output_language": request.language,
            **manifest,
        },
        config_revision=settings.revision,
        provider="openai",
        model=settings.effective_model,
        session_version=auth.user.session_version,
        api_key_id=auth.api_key.id if auth.api_key else None,
        required_scopes=SCOPES,
        **target,
    )
    db.add(job)
    await db.flush()
    return job


async def checkpoint(db, job_id, claim, index, output, sources, *, pending=False):
    job, _, _ = await guard(db, job_id, claim, ("analyzing",))
    if (
        not job.uncertain
        or index != len(job.checkpoints)
        or index >= job.total_sections
    ):
        raise HTTPException(409, "No section awaits publication")
    try:
        with validation_context(job_id, job.scope, index):
            validated = validate_section(
                output, sources, job.scope, require_current_contract=True
            )
    except ValueError:
        raise ReportFailure(
            "report_grounding", SAFE_FAILURE_MESSAGES["report_grounding"]
        ) from None
    value = [*job.checkpoints, validated]
    if len(json.dumps(value)) > 750000:
        with validation_context(job_id, job.scope, index):
            log_validation_failure(
                SectionValidationError(ValidationRule.CHECKPOINT_SIZE)
            )
        raise ReportFailure(
            "report_grounding", SAFE_FAILURE_MESSAGES["report_grounding"]
        )
    job.checkpoints = value
    job.uncertain = pending


async def publish(db, job_id, claim, sources, limits):
    job, _, _ = await guard(db, job_id, claim, ("analyzing",))
    if (
        job.uncertain
        or not job.total_sections
        or len(job.checkpoints) != job.total_sections
    ):
        with validation_context(job_id, job.scope):
            log_validation_failure(
                SectionValidationError(ValidationRule.PUBLICATION_INCOMPLETE)
            )
        raise ValueError(MESSAGES[job.scope]["incomplete"])
    findings = [
        finding for section in job.checkpoints for finding in section["findings"]
    ]
    cited = {c["source_id"] for f in findings for c in finding_citations(f)}
    report = {
        "version": 1,
        "scope": job.scope,
        "output_language": job.manifest.get("output_language", "en"),
        "run_at": datetime.now(UTC).isoformat(),
        "provider": job.provider,
        "model": job.model,
        "config_revision": job.config_revision,
        "prompt_revision": job.manifest["prompt_revision"],
        "fingerprint": job.fingerprint,
        "required_scopes": READ_SCOPES,
        "findings": findings,
        "sources": [s for s in sources if s["id"] in cited],
        "coverage": {
            "sections": job.total_sections,
            "sources": len(sources),
            "characters": sum(len(s["text"]) for s in sources),
        },
        "limitations": limits
        + [
            "Based on the saved information supplied for this report. It may be incomplete; check the cited passages."
        ]
        + list(
            dict.fromkeys(
                s for section in job.checkpoints for s in section["limitations"]
            )
        ),
    }
    if job.scope == "INTERVIEW":
        report["round_id"] = job.round_id
        report["source_media_id"] = (job.manifest or {}).get("source_media_id")
    elif job.scope == "APPLICATION":
        report["application_id"] = job.application_id
    else:
        report["period"] = (job.manifest or {}).get("period")
        report["as_of"] = (job.manifest or {}).get("as_of")
        report["time_zone"] = (job.manifest or {}).get("time_zone")
    if len(json.dumps(report)) > 1_000_000:
        with validation_context(job_id, job.scope):
            log_validation_failure(
                SectionValidationError(ValidationRule.PUBLICATION_SIZE)
            )
        raise ValueError("Report exceeds retained output bound")
    if job.scope == "INTERVIEW":
        await db.execute(
            update(Round)
            .where(
                Round.id == job.round_id, Round.interview_generation == job.generation
            )
            .values(
                interview_report=report,
                interview_report_reason=None,
                interview_generation=Round.interview_generation + 1,
            )
            .execution_options(synchronize_session=False)
        )
    elif job.scope == "APPLICATION":
        await db.execute(
            update(Application)
            .where(
                Application.id == job.application_id,
                Application.report_generation == job.generation,
            )
            .values(
                report=report,
                report_reason=None,
                report_generation=Application.report_generation + 1,
            )
            .execution_options(synchronize_session=False)
        )
    else:
        await db.execute(
            update(User)
            .where(User.id == job.user_id, User.pipeline_generation == job.generation)
            .values(
                pipeline_report=report,
                pipeline_report_reason=None,
                pipeline_generation=User.pipeline_generation + 1,
            )
            .execution_options(synchronize_session=False)
        )
    job.state = "complete"
    job.checkpoints = []
    job.manifest = {
        "fingerprint": job.fingerprint,
        "prompt_revision": job.manifest["prompt_revision"],
        "output_language": job.manifest.get("output_language", "en"),
    }


async def _scope_evidence(scope, data):
    if scope == "INTERVIEW":
        sources, limits = await evidence_sources(data)
        return sources, limits, sections(sources)
    if scope == "APPLICATION":
        sources, limits = await application_evidence_sources(data)
        return sources, limits, application_sections(sources)
    sources, limits = await pipeline_evidence_sources(data)
    return sources, limits, pipeline_sections(sources)


async def execute(executor, job_id, claim):
    async with executor.sessions() as db:
        analysis_id = await db.scalar(
            select(InterviewJob.analysis_id).where(InterviewJob.id == job_id)
        )
    if analysis_id:
        from app.services.job_analyses import execute as analysis_execute

        return await analysis_execute(executor, job_id, claim)
    async with executor.sessions() as db:
        job, data, _ = await guard(db, job_id, claim, ("analyzing",))
        scope = job.scope
        output_language = job.manifest.get("output_language", "en")
        await db.commit()
    sources, limits, batches = await _scope_evidence(scope, data)
    async with executor.sessions() as db:
        job, _, _ = await guard(db, job_id, claim, ("analyzing",))
        job.total_sections = len(batches)
        # Only non-text manifest metadata is retained before dispatch.
        job.manifest = {
            **job.manifest,
            "sources": [
                {k: v for k, v in s.items() if k != "text"}
                | {"sha256": fingerprint(s["text"])}
                for s in sources
            ],
        }
        await db.commit()

    async def analyze(index, batch, settings):
        with validation_context(job_id, scope, index):
            return await analyze_section(
                settings,
                batch,
                limits,
                scope,
                session_id=job_id,
                **(
                    {"output_language": output_language}
                    if output_language != "en"
                    else {}
                ),
            )

    # Pipeline sections are independent. Dispatch bounded waves, then retain
    # their checkpoints in source order. Other scopes keep sequential dispatch.
    width = 3 if scope == "PIPELINE" else 1
    for start in range(0, len(batches), width):
        wave = batches[start : start + width]
        async with executor.sessions() as db:
            job, _, settings = await guard(db, job_id, claim, ("analyzing",))
            if not executor.accepting:
                raise HTTPException(409, "Executor is stopping")
            # Commit before any provider call. A crash cannot trigger an
            # automatic repeat of requests whose outcome is not yet retained.
            job.uncertain = True
            await db.commit()
        tasks = [
            asyncio.create_task(analyze(start + offset, batch, settings))
            for offset, batch in enumerate(wave)
        ]
        try:
            outputs = await asyncio.gather(*tasks)
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        for offset, (batch, output) in enumerate(zip(wave, outputs, strict=True)):
            async with executor.sessions() as db:
                await checkpoint(
                    db,
                    job_id,
                    claim,
                    start + offset,
                    output,
                    batch,
                    pending=offset < len(wave) - 1,
                )
                await db.commit()
    async with executor.sessions() as db:
        await publish(db, job_id, claim, sources, limits)
        await db.commit()


def status(job):
    from app.services.interview_text import SAFE_FAILURE_MESSAGES

    failure_code = next(
        (
            "report_" + key
            for key, message in SAFE_FAILURE_MESSAGES.items()
            if message == job.error
        ),
        "report_unknown",
    )
    return {
        "id": job.id,
        "intent_id": job.intent_id,
        "scope": job.scope,
        "period": (job.manifest or {}).get("period"),
        "as_of": (job.manifest or {}).get("as_of"),
        "time_zone": (job.manifest or {}).get("time_zone"),
        "prompt_revision": (job.manifest or {}).get("prompt_revision"),
        "state": job.state,
        "uncertain": job.uncertain,
        "error": job.error,
        "error_code": failure_code if job.error else None,
        "provider": job.provider,
        "model": job.model,
        "created_at": job.created_at,
        "completed_sections": job.total_sections
        if job.state == "complete"
        else len(job.checkpoints),
        "total_sections": job.total_sections,
    }


def _capability(settings, scope):
    return {
        "available": supported(settings),
        "provider": settings.disclosure().provider,
        "model": settings.disclosure().model,
        "configuration_revision": settings.revision,
        "message": "Feedback supports explicit openai/ text models and an explicit endpoint only. Configured is not verified.",
        "input_disclosure": {
            "INTERVIEW": "Saved job requirements, current application/history, round notes and manual summary, corrected transcript and assigned roles, current CV/cover-letter text and relevant profile experience. Unsaved drafts and contact fields are not sent. Up to 128 bounded section requests; no automatic retry.",
            "APPLICATION": "Saved job requirements and application fields, recorded status history, this application's round notes and prior round findings, current CV/cover-letter text and relevant profile experience. Unsaved drafts and contact fields are not sent. Up to 128 bounded section requests; no automatic retry.",
            "PIPELINE": "Deterministic pipeline metrics computed by the application, recorded approach/source and round outcome facts, and relevant recorded profile experience. Contact fields, documents and unsaved drafts are not sent. Up to 128 bounded section requests; no automatic retry.",
        }[scope],
        "external_processing": settings.disclosure().external_processing,
    }


async def _read_common(db, auth, scope, *, round_row=None, application_row=None):
    settings = await get_ai_settings(db)
    if scope == "INTERVIEW":
        report = round_row.interview_report if round_row else None
        stale = round_row.interview_report_reason if round_row else None
        generation = round_row.interview_generation if round_row else None
    elif scope == "APPLICATION":
        report = application_row.report if application_row else None
        stale = application_row.report_reason if application_row else None
        generation = application_row.report_generation if application_row else None
    elif scope == "PIPELINE":
        row = (
            await db.execute(
                select(
                    User.pipeline_report,
                    User.pipeline_report_reason,
                    User.pipeline_generation,
                ).where(User.id == auth.user.id)
            )
        ).first()
        report, stale, generation = row if row is not None else (None, None, None)
    else:
        raise KeyError(scope)
    if report and not stale:
        stale = _prompt_stale_reason(report, scope)
    latest = await db.scalar(
        select(InterviewJob)
        .where(
            InterviewJob.user_id == auth.user.id,
            InterviewJob.scope == scope,
            *(
                (InterviewJob.round_id == round_row.id,)
                if round_row is not None
                else (InterviewJob.application_id == application_row.id,)
                if application_row is not None
                else ()
            ),
        )
        .order_by(InterviewJob.created_at.desc())
        .limit(1)
    )
    return {
        "generation": generation,
        "report": report,
        "stale_reason": stale,
        "job": status(latest) if latest else None,
        "capability": _capability(settings, scope),
    }


async def read(db, auth, round_id):
    await lock_ai_settings(db)
    await authority(
        db,
        auth.user.id,
        auth.user.session_version,
        auth.api_key.id if auth.api_key else None,
        READ_SCOPES,
    )
    # Re-read relevant content at GET time, never dispatch or parse documents.
    data, digest = await snapshot(db, auth.user.id, round_id)
    round_row = await db.scalar(
        select(Round)
        .where(Round.id == round_id)
        .execution_options(populate_existing=True)
    )
    result = await _read_common(db, auth, "INTERVIEW", round_row=round_row)
    if result["report"] and (
        result["report"].get("fingerprint") != digest
        or result["report"].get("config_revision")
        != result["capability"]["configuration_revision"]
    ):
        result["stale_reason"] = (
            result["stale_reason"]
            or "evidence or text configuration changed; rerun required"
        )
    result["stale_reason_code"] = _stale_reason_code(result.get("stale_reason"))
    return result


async def read_application(db, auth, application_id):
    await lock_ai_settings(db)
    await authority(
        db,
        auth.user.id,
        auth.user.session_version,
        auth.api_key.id if auth.api_key else None,
        READ_SCOPES,
    )
    data, digest = await application_snapshot(db, auth.user.id, application_id)
    application_row = await db.scalar(
        select(Application)
        .where(Application.id == application_id)
        .execution_options(populate_existing=True)
    )
    result = await _read_common(
        db, auth, "APPLICATION", application_row=application_row
    )
    if result["report"] and (
        result["report"].get("fingerprint") != digest
        or result["report"].get("config_revision")
        != result["capability"]["configuration_revision"]
    ):
        result["stale_reason"] = (
            result["stale_reason"]
            or "application evidence or text configuration changed; rerun required"
        )
    result["stale_reason_code"] = _stale_reason_code(result.get("stale_reason"))
    return result


async def read_pipeline(db, auth, period="30d", as_of=None, x_timezone=None):
    await lock_ai_settings(db)
    await authority(
        db,
        auth.user.id,
        auth.user.session_version,
        auth.api_key.id if auth.api_key else None,
        READ_SCOPES,
    )
    # The clock is resolved the same way as the analytics endpoints so a report
    # read can never contradict /api/analytics/pipeline for the same instant.
    instant, zone = analytics_clock(auth.user, x_timezone, as_of)
    result = await _read_common(db, auth, "PIPELINE")
    result["period"] = period
    result["time_zone"] = zone
    # Compare instants, not their renderings: the stored value is UTC-normalized,
    # so echoing a raw non-UTC offset would always differ for the same moment.
    result["as_of"] = instant.isoformat() if as_of else None
    report = result["report"]
    if report and (
        report.get("config_revision") != result["capability"]["configuration_revision"]
        or report.get("period") != period
        or report.get("time_zone") != zone
        or (as_of is not None and report.get("as_of") != result["as_of"])
    ):
        result["stale_reason"] = (
            result["stale_reason"]
            or "pipeline scope or text configuration changed; rerun required"
        )
    elif report and as_of is None:
        # Compare at the saved report instant; using now would always mark it stale.
        stored_zone = report.get("time_zone") or zone
        _, digest = await pipeline_snapshot(
            db,
            auth.user.id,
            report.get("period") or period,
            await _pinned_as_of(report.get("as_of")),
            stored_zone,
        )
        if report.get("fingerprint") != digest:
            result["stale_reason"] = (
                result["stale_reason"] or "pipeline evidence changed; rerun required"
            )
    result["stale_reason_code"] = _stale_reason_code(result.get("stale_reason"))
    return result


# Backwards-compatible name for existing call sites and tests.
invalidate_interviews = invalidate_reports
