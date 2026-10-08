"""Validate report citations and remap them to imported owner records."""

import json
import logging
from copy import deepcopy
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.interview_feedback import (
    InterviewFinding,
    PipelineFinding,
    validate_document_text,
)
from app.services.interview_evidence import (
    APP_FIELDS,
    PROFILE_FIELDS,
    ROUND_FIELDS,
    profile_work_history,
)
from app.services.interview_jobs import READ_SCOPES
from app.services.interview_text import finding_citations, validate_section

logger = logging.getLogger(__name__)

# One outward message for every archive rejection; never leak internal detail.
GENERIC_ARCHIVE_ERROR = (
    "Invalid grounded-report/document archive. Check bounded fields, own-source "
    "references and exact citations; no data imported"
)


class ReportSource(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: str = Field(min_length=1, max_length=160)
    kind: Literal[
        "requirement",
        "application",
        "round",
        "transcript",
        "history",
        "profile",
        "cv",
        "cover_letter",
        "pipeline_metrics",
        "pipeline_record",
    ]
    text: str = Field(min_length=1, max_length=4000)
    offset: int = Field(ge=0, le=2_300_000)
    segment_id: str | None = Field(default=None, max_length=36)
    role: Literal["candidate", "interviewer", "other", "unknown"] | None = None
    start: float | None = Field(default=None, ge=0, le=7200)
    end: float | None = Field(default=None, ge=0, le=7200)


class Coverage(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    sections: int = Field(ge=1, le=128)
    sources: int = Field(ge=1, le=10000)
    characters: int = Field(ge=1, le=2_300_000)


class ArchivedInterviewReport(BaseModel):
    output_language: Literal["en", "sr-Latn"] = "en"
    model_config = ConfigDict(extra="forbid", strict=True)
    version: Literal[1]
    scope: Literal["INTERVIEW"]
    round_id: str = Field(min_length=1, max_length=36)
    run_at: str = Field(min_length=1, max_length=64)
    provider: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=200)
    config_revision: str = Field(max_length=36)
    prompt_revision: str | None = Field(
        default=None, min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$"
    )
    fingerprint: str = Field(max_length=64)
    required_scopes: list[str] = Field(max_length=6)
    source_media_id: str | None = Field(default=None, max_length=36)
    findings: list[InterviewFinding] = Field(max_length=256)
    # Six supporting passages and one separately attributed question per finding.
    sources: list[ReportSource] = Field(max_length=1792)
    coverage: Coverage
    limitations: list[str] = Field(max_length=1050)


class ArchivedScopedReport(BaseModel):
    output_language: Literal["en", "sr-Latn"] = "en"
    """Application- and pipeline-scope latest report; latest only, never a history."""

    model_config = ConfigDict(extra="forbid", strict=True)
    version: Literal[1]
    scope: Literal["APPLICATION", "PIPELINE"]
    run_at: str = Field(min_length=1, max_length=64)
    provider: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=200)
    config_revision: str = Field(max_length=36)
    prompt_revision: str | None = Field(
        default=None, min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$"
    )
    fingerprint: str = Field(max_length=64)
    required_scopes: list[str] = Field(max_length=6)
    application_id: str | None = Field(default=None, max_length=36)
    period: Literal["7d", "30d", "3m", "all"] | None = None
    as_of: str | None = Field(default=None, max_length=64)
    time_zone: str | None = Field(default=None, max_length=64)
    findings: list[PipelineFinding] = Field(max_length=384)
    # Keep every bounded record citation; the one-megabyte report bound still applies.
    sources: list[ReportSource] = Field(max_length=6144)
    coverage: Coverage
    limitations: list[str] = Field(max_length=1050)


def _profile_row(models):
    rows = models.get("UserProfile", [])
    return rows[0] if rows else None


def _profile_field_text(profile, field, *, filtered=True):
    """Rebuild current profile passages or older unfiltered archive passages."""
    value = profile.get(field)
    if field == "work_history" and filtered:
        value = profile_work_history(value)
    if value is None or value == "" or value == []:
        return None
    if not isinstance(value, str):
        value = json.dumps(value, default=str, ensure_ascii=False)
    return value


def _require(condition):
    if not condition:
        raise ValueError()


def _validate_scoped_report(value, models, apps, histories, profile, *, scope):
    """Validate one APPLICATION/PIPELINE latest report against the archive."""
    _require(len(json.dumps(value.model_dump())) <= 1_000_000)
    _require(value.scope == scope)
    datetime.fromisoformat(value.run_at)
    _require(value.required_scopes == READ_SCOPES)
    if scope == "APPLICATION":
        _require(value.application_id in apps)
    else:
        _require(value.period in ("7d", "30d", "3m", "all"))
        if value.as_of is not None:
            datetime.fromisoformat(value.as_of)
    round_ids = {r.get("id") for r in models.get("Round", [])}
    source_ids = set()
    for source in value.sources:
        _require(source.id not in source_ids)
        source_ids.add(source.id)
        parts = source.id.split(":")
        _require(str(source.offset) == parts[-1] and source.offset % 4000 == 0)
        head = parts[0]
        if head == "profile":
            _require(len(parts) == 3 and parts[1] in PROFILE_FIELDS)
            texts = [_profile_field_text(profile, parts[1])]
            if scope == "PIPELINE":
                texts.append(_profile_field_text(profile, parts[1], filtered=False))
            _require(
                any(
                    text is not None
                    and text[source.offset : source.offset + 4000] == source.text
                    for text in texts
                )
            )
        elif head == "application" or head == "document":
            _require(
                len(parts) == 4
                and scope == "APPLICATION"
                and parts[1] == value.application_id
            )
            if head == "document":
                # A cited document must actually exist on this application; the
                # post-insert text verification cannot see a document that was
                # never there, so absent documents are rejected here.
                _require(parts[2] in ("cv", "cover_letter"))
                source_row = apps.get(parts[1], {})
                _require(
                    source_row.get(parts[2] + "_text")
                    or source_row.get(parts[2] + "_path")
                )
        elif head == "round":
            _require(len(parts) == 4 and scope == "APPLICATION")
            _require(parts[1] in round_ids)
        elif head == "history":
            _require(len(parts) == 3 and scope == "APPLICATION")
            _require(
                histories.get(parts[1], {}).get("application_id")
                == value.application_id
            )
        elif head == "pipeline":
            _require(scope == "PIPELINE" and len(parts) == 3)
        else:
            raise ValueError()
    cited = {
        c["source_id"]
        for f in value.findings
        for c in finding_citations(f.model_dump())
    }
    _require(source_ids == cited)
    sources = [s.model_dump(exclude_none=True) for s in value.sources]
    for finding in value.findings:
        validate_section(
            {"findings": [finding.model_dump(exclude_none=True)], "limitations": []},
            sources,
            scope,
        )


def validate_reports_archive(models):
    """Validate every archived latest report before any recipient mutation."""
    try:
        for name in ("Application", "Round", "ApplicationStatusHistory", "RoundMedia"):
            rows = models.get(name, [])
            _require(isinstance(rows, list) and all(isinstance(r, dict) for r in rows))
        report_rows = [
            r
            for r in models.get("Round", [])
            + models.get("Application", [])
            + models.get("User", [])
            if r.get("interview_report") is not None
            or r.get("report") is not None
            or r.get("pipeline_report") is not None
        ]
        if report_rows:
            for name in (
                "Application",
                "Round",
                "ApplicationStatusHistory",
                "RoundMedia",
                "User",
                "UserProfile",
            ):
                rows = models.get(name, [])
                _require(
                    isinstance(rows, list) and all(isinstance(r, dict) for r in rows)
                )
                ids = [r.get("id") for r in rows]
                _require(
                    all(isinstance(i, str) for i in ids)
                    and len(set(ids)) == len(ids)
                    and all(r.get("__original_id__") == r.get("id") for r in rows)
                )
        apps = {r.get("id"): r for r in models.get("Application", [])}
        histories = {r.get("id"): r for r in models.get("ApplicationStatusHistory", [])}
        media = {r.get("id"): r for r in models.get("RoundMedia", [])}
        profile = _profile_row(models)
        for application in apps.values():
            for kind in ("cv", "cover_letter"):
                text = application.get(kind + "_text")
                if text is not None:
                    validate_document_text(text)
        for row in models.get("Round", []):
            report = row.get("interview_report")
            if report is None:
                continue
            if len(json.dumps(report)) > 1_000_000:
                raise ValueError()
            value = ArchivedInterviewReport.model_validate(report)
            app = apps.get(row.get("application_id"))
            _require(app is not None)
            assert app is not None
            _require(value.round_id == row["id"])
            if (
                value.source_media_id
                and media.get(value.source_media_id, {}).get("round_id") != row["id"]
            ):
                raise ValueError()
            segments = {
                s["id"]: s
                for s in (row.get("current_transcript") or {}).get("segments", [])
            }
            source_ids = set()
            for source in value.sources:
                _require(source.id not in source_ids)
                source_ids.add(source.id)
                parts = source.id.split(":")
                if str(source.offset) != parts[-1] or source.offset % 4000:
                    raise ValueError()
                if source.kind == "transcript":
                    if len(parts) != 3 or parts[0] != "transcript":
                        raise ValueError()
                    if parts[1] not in segments:
                        raise ValueError(
                            "Interview report cites a replaced transcript passage absent from this archive. Rerun using the current transcript before exporting."
                        )
                    transcript = row["current_transcript"]
                    if value.source_media_id != transcript.get("source_media_id") or (
                        transcript.get("provenance") == "media"
                        and not value.source_media_id
                    ):
                        raise ValueError()
                    segment = segments[parts[1]]
                    if (
                        source.segment_id != parts[1]
                        or source.role != segment["role"]
                        or source.text
                        != segment["text"][source.offset : source.offset + 4000]
                        or source.start != segment.get("start")
                        or source.end != segment.get("end")
                    ):
                        raise ValueError()
                elif source.kind in ("cv", "cover_letter"):
                    if (
                        len(parts) != 4
                        or parts[:3] != ["document", app["id"], source.kind]
                        or not (
                            app.get(source.kind + "_text")
                            or app.get(source.kind + "_path")
                        )
                    ):
                        raise ValueError()
                    pasted = app.get(source.kind + "_text")
                    if (
                        pasted
                        and source.text != pasted[source.offset : source.offset + 4000]
                    ):
                        raise ValueError()
                elif source.kind in ("application", "requirement"):
                    if (
                        len(parts) != 4
                        or parts[:2] != ["application", app["id"]]
                        or parts[2] not in APP_FIELDS
                    ):
                        raise ValueError()
                    requirement = (
                        parts[2].startswith("requirements_")
                        or parts[2] == "job_description"
                    )
                    if (source.kind == "requirement") != requirement:
                        raise ValueError()
                elif source.kind == "round":
                    if (
                        len(parts) != 4
                        or parts[:2] != ["round", row["id"]]
                        or parts[2] not in ROUND_FIELDS
                    ):
                        raise ValueError()
                elif source.kind == "history":
                    if len(parts) != 3 or parts[0] != "history":
                        raise ValueError()
                    entry = histories.get(parts[1])
                    if entry is None or entry.get("application_id") != app["id"]:
                        raise ValueError()
                    if entry.get("is_gap"):
                        raise ValueError()
                elif source.kind == "profile":
                    if len(parts) != 3 or parts[0] != "profile":
                        raise ValueError()
                    if parts[1] not in PROFILE_FIELDS:
                        raise ValueError()
                    text = _profile_field_text(profile, parts[1])
                    if text is None or (
                        text[source.offset : source.offset + 4000] != source.text
                    ):
                        raise ValueError()
                else:
                    raise ValueError()
            cited = {
                c["source_id"]
                for f in value.findings
                for c in finding_citations(f.model_dump())
            }
            if source_ids != cited:
                raise ValueError()
            sources = [s.model_dump(exclude_none=True) for s in value.sources]
            for finding in value.findings:
                validate_section(
                    {
                        "findings": [finding.model_dump(exclude_none=True)],
                        "limitations": [],
                    },
                    sources,
                )
        for application in apps.values():
            report = application.get("report")
            if report is None:
                continue
            value = ArchivedScopedReport.model_validate(report)
            _validate_scoped_report(
                value, models, apps, histories, profile, scope="APPLICATION"
            )
        for user in models.get("User", []):
            report = user.get("pipeline_report")
            if report is None:
                continue
            value = ArchivedScopedReport.model_validate(report)
            _validate_scoped_report(
                value, models, apps, histories, profile, scope="PIPELINE"
            )
    except ValueError as exc:
        if str(exc).startswith(
            ("Interview report cites a replaced", "Profile-cited interview")
        ):
            raise
        # The specific cause is deliberately masked outward; log it so an operator
        # can diagnose a rejection without exposing internal detail to the client.
        logger.warning("Rejected grounded-report/document archive: %s", exc)
        raise ValueError(
            "Invalid grounded-report/document archive. Check bounded fields, own-source references and exact citations; no data imported"
        ) from None
    except (KeyError, TypeError, AttributeError) as exc:
        logger.warning("Rejected grounded-report/document archive: %s", exc)
        raise ValueError(
            "Invalid grounded-report/document archive; no data imported"
        ) from None


validate_interview_archive = validate_reports_archive


def _restore_archived_ids(text, inverse):
    """Rewrite regenerated identities back to the archived ones for comparison.

    Pipeline source text embeds application identities, and imported rows receive
    new ids. Comparing the regenerated passage to the archive therefore requires
    mapping the new ids back to the archived ones. Identities are UUIDs, so a
    plain substring substitution cannot collide.
    """
    for new, old in inverse.items():
        if new in text:
            text = text.replace(new, old)
    return text


def _expected_index(regenerated_sources, inverse):
    """Index re-derived passages for comparison with a restored report.

    A restored report has its source IDS remapped to the imported identities but
    its passage TEXT still embeds the archived identities (remapping never
    rewrites text). Regenerated IDs are therefore already the right lookup key,
    while regenerated text must be mapped back to the archived identities.
    """
    index: dict[str, str] = {}
    for source in regenerated_sources:
        index[source["id"]] = _restore_archived_ids(source["text"], inverse)
    return index


def _verify_report_sources(report, candidates):
    """Require every archived passage to equal a passage re-derived locally.

    Shape checks alone let a tampered archive carry fabricated evidence text that
    the recipient UI renders as grounded. A source passes only when some locally
    re-derived candidate reproduces its exact text; fabricated text matches none.

    `candidates` is a list of indexes because one scope has two legitimate shapes
    (an application report may or may not have included other rounds' interview
    findings when it ran). Document kinds are verified only when the regenerated
    evidence contains them: an attachment whose text cannot be re-extracted
    locally is left to the pre-mutation existence check, matching the existing
    pasted-versus-attachment discipline.
    """
    if not report:
        return
    degraded = {"document", "cv", "cover_letter"}
    for source in report.get("sources", []):
        seen = False
        for expected in candidates:
            text = expected.get(source["id"])
            if text is None:
                continue
            seen = True
            if text == source["text"]:
                break
        else:
            # The document exists, but its text may not be locally extractable.
            if not seen and source.get("kind") in degraded:
                continue
            raise ValueError(
                "Report source text does not match the re-derived evidence: "
                + source["id"]
            )


async def verify_restored_report_text(db, user_id, export_data, id_mapper, segment_ids):
    """Re-derive each restored report's evidence and require exact passage text.

    Runs AFTER the imported rows are flushed but BEFORE the import commit, so a
    mismatch still leaves the recipient's prior data intact. The archive is
    untrusted input: without this check a fabricated passage survives validation
    because only the reference shape was verified.
    """
    from sqlalchemy import select

    from app.models import Application, Round, User
    from app.services.interview_evidence import (
        _append_source,
        application_evidence_sources,
        application_snapshot,
        evidence_sources,
        pipeline_evidence_sources,
        pipeline_snapshot,
        snapshot,
    )

    models = export_data.get("models", {})
    # Regenerated ids embed the IMPORTED identities, so every remapped identity
    # must be mapped back before comparing ids and text.
    inverse: dict[str, str] = {}
    for key, new_id in id_mapper.mappings.items():
        model_name, _, old_id = key.partition(":")
        if model_name in (
            "Application",
            "Round",
            "ApplicationStatusHistory",
            "RoundMedia",
        ):
            inverse[new_id] = old_id
    for (_round_original, old_segment_id), new_segment_id in (
        segment_ids or {}
    ).items():
        inverse[new_segment_id] = old_segment_id
    try:
        for row in models.get("Round", []):
            if row.get("interview_report") is None:
                continue
            new_round = id_mapper.get("Round", row["id"])
            data, _ = await snapshot(db, user_id, new_round)
            expected, _ = await evidence_sources(data)
            restored = await db.scalar(
                select(Round.interview_report).where(Round.id == new_round)
            )
            _verify_report_sources(restored, [_expected_index(expected, inverse)])
        for row in models.get("Application", []):
            if row.get("report") is None:
                continue
            new_app = id_mapper.get("Application", row["id"])
            data, _ = await application_snapshot(db, user_id, new_app)
            variants = []
            for include in (True, False):
                expected, _ = await application_evidence_sources(
                    data, include_round_reports=include
                )
                variants.append(_expected_index(expected, inverse))
            restored = await db.scalar(
                select(Application.report).where(Application.id == new_app)
            )
            _verify_report_sources(restored, variants)
        # Read the columns directly: the identity-mapped User instance may hold a
        # stale/expired attribute in this session, which would lazy-load asynchronously.
        pipeline_report = await db.scalar(
            select(User.pipeline_report).where(User.id == user_id)
        )
        if pipeline_report is not None:
            report = pipeline_report
            as_of = (
                datetime.fromisoformat(report["as_of"]) if report.get("as_of") else None
            )
            data, _ = await pipeline_snapshot(
                db,
                user_id,
                report["period"],
                as_of,
                report.get("time_zone") or "UTC",
            )
            expected, _ = await pipeline_evidence_sources(data)
            # Older archives can cite unfiltered profile data; verify it locally only.
            legacy_profile = []
            _append_source(
                legacy_profile,
                "profile:work_history",
                "profile",
                data["profile"].get("work_history"),
            )
            _verify_report_sources(
                report,
                [
                    _expected_index(expected, inverse),
                    _expected_index(legacy_profile, inverse),
                ],
            )
    except Exception as exc:  # noqa: BLE001 - convert to one outward archive error
        logger.warning(
            "Imported report evidence failed verification for user %s: %r",
            user_id,
            exc,
        )
        raise ValueError(GENERIC_ARCHIVE_ERROR) from None


def _remap_sources(value, mapper, segment_ids, original_key):
    refs = {}
    for source in value["sources"]:
        parts = source["id"].split(":")
        old = source["id"]
        if parts[0] == "transcript":
            parts[1] = segment_ids[(original_key, parts[1])]
            source["segment_id"] = parts[1]
        elif parts[0] in ("application", "document", "round", "history"):
            parts[1] = mapper.get(
                {
                    "application": "Application",
                    "document": "Application",
                    "round": "Round",
                    "history": "ApplicationStatusHistory",
                }[parts[0]],
                parts[1],
            )
        source["id"] = refs[old] = ":".join(parts)
    for finding in value["findings"]:
        for citation in finding_citations(finding):
            citation["source_id"] = refs[citation["source_id"]]
    return value


def remap_report(report, mapper, segment_ids, *, original_round_id=None):
    """Remap a latest report to imported identities; clears freshness proof."""
    value = deepcopy(report)
    value["fingerprint"] = ""
    value["config_revision"] = ""
    scope = value.get("scope")
    if scope == "INTERVIEW":
        value["round_id"] = mapper.get("Round", report["round_id"])
        value["source_media_id"] = (
            mapper.get("RoundMedia", report["source_media_id"])
            if report.get("source_media_id")
            else None
        )
        value = _remap_sources(
            value, mapper, segment_ids, original_round_id or report["round_id"]
        )
    elif scope == "APPLICATION":
        value["application_id"] = mapper.get("Application", report["application_id"])
        value = _remap_sources(value, mapper, segment_ids, None)
    else:
        value = _remap_sources(value, mapper, segment_ids, None)
    return value
