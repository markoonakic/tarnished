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
    fingerprint,
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


class BoundedEvidenceSnapshot(BaseModel):
    """Original model input passages; no file paths or account authority."""

    model_config = ConfigDict(extra="forbid", strict=True)
    sources: list[ReportSource] = Field(min_length=1, max_length=10000)
    source_media_id: str | None = Field(default=None, max_length=36)


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
    evidence_snapshot: BoundedEvidenceSnapshot | None = None
    evidence_fingerprint: str | None = Field(
        default=None, min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$"
    )
    evidence_ids: dict[str, str] = Field(default_factory=dict, max_length=20000)
    findings: list[InterviewFinding] = Field(max_length=256)
    # Six supporting passages and one separately attributed question per finding.
    sources: list[ReportSource] = Field(max_length=1792)
    coverage: Coverage
    limitations: list[str] = Field(max_length=1050)


class PipelineEvidenceSnapshot(BaseModel):
    """Saved pipeline input. It is historical data, never restored authority."""

    model_config = ConfigDict(extra="forbid", strict=True)
    period: Literal["7d", "30d", "3m", "all"]
    as_of: str | None = Field(max_length=64)
    time_zone: str = Field(min_length=1, max_length=64)
    metrics: dict
    profile: dict


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
    evidence_snapshot: PipelineEvidenceSnapshot | BoundedEvidenceSnapshot | None = None
    evidence_fingerprint: str | None = Field(
        default=None, min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$"
    )
    evidence_ids: dict[str, str] = Field(default_factory=dict, max_length=20000)
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


def _original_id(value, record_id):
    return value.evidence_ids.get(record_id, record_id)


def _validate_passage_snapshot(value, models, app_id):
    saved = value.evidence_snapshot
    _require(isinstance(saved, BoundedEvidenceSnapshot))
    _require(
        fingerprint(saved.model_dump(exclude_unset=True)) == value.evidence_fingerprint
    )
    _require(sum(len(s.text) for s in saved.sources) <= 2_300_000)
    _require(
        saved.source_media_id
        == (value.source_media_id if value.scope == "INTERVIEW" else None)
    )
    rounds = {r["id"]: r for r in models.get("Round", [])}
    histories = {r["id"]: r for r in models.get("ApplicationStatusHistory", [])}
    seen = set()
    for source in saved.sources:
        _require(source.id not in seen)
        seen.add(source.id)
        parts = source.id.split(":")
        _require(len(parts) >= 3)
        _require(str(source.offset) == parts[-1] and source.offset % 4000 == 0)
        head = parts[0]
        record_id = _original_id(value, parts[1])
        if head in ("application", "document"):
            _require(len(parts) == 4 and record_id == app_id)
            _require(
                parts[2]
                in (APP_FIELDS if head == "application" else ("cv", "cover_letter"))
            )
        elif head == "round":
            _require(
                len(parts) == 4
                and rounds.get(record_id, {}).get("application_id") == app_id
            )
            _require(parts[2] in (*ROUND_FIELDS, "interview_findings"))
            if value.scope == "INTERVIEW":
                _require(
                    record_id == value.round_id and parts[2] != "interview_findings"
                )
        elif head == "history":
            _require(
                len(parts) == 3
                and histories.get(record_id, {}).get("application_id") == app_id
            )
            _require(not histories[record_id].get("is_gap"))
        elif head == "profile":
            _require(len(parts) == 3 and parts[1] in PROFILE_FIELDS)
        elif head == "transcript":
            _require(value.scope == "INTERVIEW" and len(parts) == 3)
            _require(source.segment_id == parts[1] and source.role is not None)
        else:
            raise ValueError()
        expected_kind = {
            "application": "requirement"
            if parts[2].startswith("requirements_") or parts[2] == "job_description"
            else "application",
            "document": parts[2] if head == "document" else None,
            "round": "round",
            "history": "history",
            "profile": "profile",
            "transcript": "transcript",
        }[head]
        _require(source.kind == expected_kind)
    _require(all(s.id in seen for s in value.sources))


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
    rows = {
        r["id"]: r
        for name in ("Application", "Round", "ApplicationStatusHistory")
        for r in models.get(name, [])
    }
    _require(all(key in rows for key in value.evidence_ids.values()))
    _require(not value.evidence_ids or scope == "PIPELINE")
    if isinstance(value.evidence_snapshot, BoundedEvidenceSnapshot):
        _require(scope == "APPLICATION")
        _validate_passage_snapshot(value, models, value.application_id)
    elif value.evidence_snapshot is not None:
        _require(scope == "PIPELINE")
        saved = value.evidence_snapshot.model_dump()
        _require(fingerprint(saved) == value.evidence_fingerprint)
        _require(saved["period"] == value.period and saved["as_of"] == value.as_of)
        _require(saved["time_zone"] == value.time_zone)
        _require(set(saved["profile"]) == set(PROFILE_FIELDS))
        # Snapshot identities must resolve to this archive, never database IDs.
        for record in saved["metrics"].get("applications", []):
            _require(
                value.evidence_ids.get(
                    record["application_id"], record["application_id"]
                )
                in apps
            )
        for record in saved["metrics"].get("rounds", []):
            app_id = value.evidence_ids.get(
                record["application_id"], record["application_id"]
            )
            _require(app_id in apps)
    else:
        _require(value.evidence_fingerprint is None)
    round_ids = {r.get("id") for r in models.get("Round", [])}
    source_ids = set()
    for source in value.sources:
        _require(source.id not in source_ids)
        source_ids.add(source.id)
        parts = source.id.split(":")
        _require(len(parts) >= 3)
        _require(str(source.offset) == parts[-1] and source.offset % 4000 == 0)
        head = parts[0]
        if head == "profile":
            _require(len(parts) == 3 and parts[1] in PROFILE_FIELDS)
        elif head == "application" or head == "document":
            _require(
                len(parts) == 4
                and scope == "APPLICATION"
                and _original_id(value, parts[1]) == value.application_id
            )
            if head == "document":
                # A cited document must actually exist on this application; the
                # post-insert text verification cannot see a document that was
                # never there, so absent documents are rejected here.
                _require(parts[2] in ("cv", "cover_letter"))
                if value.evidence_snapshot is None:
                    source_row = apps.get(parts[1], {})
                    _require(
                        source_row.get(parts[2] + "_text")
                        or source_row.get(parts[2] + "_path")
                    )
        elif head == "round":
            _require(len(parts) == 4 and scope == "APPLICATION")
            _require(_original_id(value, parts[1]) in round_ids)
            _require(
                next(
                    r
                    for r in models["Round"]
                    if r["id"] == _original_id(value, parts[1])
                )["application_id"]
                == value.application_id
            )
        elif head == "history":
            _require(len(parts) == 3 and scope == "APPLICATION")
            _require(
                histories.get(_original_id(value, parts[1]), {}).get("application_id")
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
        users = models.get("User", [])
        _require(len(users) <= 1)
        if users:
            owner_id = users[0]["id"]
            _require(all(r.get("user_id") == owner_id for r in apps.values()))
            _require(
                all(r.get("user_id") == owner_id for r in models.get("UserProfile", []))
            )
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
            _require(value.required_scopes == READ_SCOPES and not value.evidence_ids)
            datetime.fromisoformat(value.run_at)
            if value.evidence_snapshot is not None:
                _validate_passage_snapshot(value, models, app["id"])
            else:
                _require(value.evidence_fingerprint is None)
                transcript = row.get("current_transcript")
                if transcript and any(s.kind == "transcript" for s in value.sources):
                    _require(value.source_media_id == transcript.get("source_media_id"))
                    _require(
                        transcript.get("provenance") != "media"
                        or value.source_media_id is not None
                    )
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
                    _require(source.segment_id == parts[1])
                elif source.kind in ("cv", "cover_letter"):
                    if (
                        len(parts) != 4
                        or parts[0] != "document"
                        or _original_id(value, parts[1]) != app["id"]
                        or parts[2] != source.kind
                    ):
                        raise ValueError()
                    if value.evidence_snapshot is None:
                        _require(
                            app.get(source.kind + "_text")
                            or app.get(source.kind + "_path")
                        )
                elif source.kind in ("application", "requirement"):
                    if (
                        len(parts) != 4
                        or parts[0] != "application"
                        or _original_id(value, parts[1]) != app["id"]
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
                        or parts[0] != "round"
                        or _original_id(value, parts[1]) != row["id"]
                        or parts[2] not in ROUND_FIELDS
                    ):
                        raise ValueError()
                elif source.kind == "history":
                    if len(parts) != 3 or parts[0] != "history":
                        raise ValueError()
                    entry = histories.get(_original_id(value, parts[1]))
                    if entry is None or entry.get("application_id") != app["id"]:
                        raise ValueError()
                    if entry.get("is_gap"):
                        raise ValueError()
                elif source.kind == "profile":
                    if len(parts) != 3 or parts[0] != "profile":
                        raise ValueError()
                    if parts[1] not in PROFILE_FIELDS:
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

        for application in apps.values():
            report = application.get("report")
            if report is None:
                continue
            value = ArchivedScopedReport.model_validate(report)
            _require(value.application_id == application["id"])
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
    except (KeyError, IndexError, TypeError, AttributeError) as exc:
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
    """Require exact retained or locally rebuilt text for every passage.

    Even an existing attachment does not prove a legacy quoted passage when its
    text cannot be extracted. Skip that report instead of accepting unknown text.
    """
    if not report:
        return
    for source in report.get("sources", []):
        if not any(
            expected.get(source["id"]) == source["text"] for expected in candidates
        ):
            raise ValueError(
                "Report source text does not match verified input: " + source["id"]
            )


def _archived_pipeline_insights(models, metrics, inverse):
    """Verify saved matrix inputs locally before import resets their permissions."""
    from types import SimpleNamespace

    from app.services.job_analyses import comparison_inputs, validate_output
    from app.services.requirement_insights import requirement_insights

    ids = {
        inverse.get(r["application_id"], r["application_id"])
        for r in metrics["applications"]
    }
    apps = {
        r["id"]: SimpleNamespace(**r)
        for r in models.get("Application", [])
        if r["id"] in ids and r.get("confirmed_requirements")
    }
    profile_row = _profile_row(models)
    profile = SimpleNamespace(**profile_row) if profile_row else None
    matches, seen = {}, set()
    for row in sorted(
        models.get("JobAnalysis", []),
        key=lambda r: r.get("created_at", ""),
        reverse=True,
    ):
        app_id = row.get("application_id")
        if (
            row.get("kind") != "PROFILE_MATCH"
            or row.get("review_state") != "ready"
            or app_id not in apps
            or app_id in seen
        ):
            continue
        seen.add(app_id)
        data, revisions = comparison_inputs(apps[app_id], profile)
        if (
            row.get("fingerprint") == fingerprint(data)
            and row.get("input_revisions") == revisions
        ):
            value = validate_output(row["draft"], [{"data": data}], "PROFILE_MATCH")
            matches[app_id] = value["rows"]
    return requirement_insights(list(apps.values()), matches)


async def verify_restored_report_text(db, user_id, export_data, id_mapper, segment_ids):
    """Verify original input, or rebuild legacy input; skip unverifiable reports.

    Structural checks run before mutation. Content checks run before commit,
    so fabricated report text is never restored with the other owner data.
    """
    from sqlalchemy import select, update

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
    from app.models import UserProfile

    # Local archive verification is not an AI input. Verify old passages against
    # restored content even though import resets every profile permission.
    # Imported reports keep empty fingerprints and cannot become AI evidence.
    profile = await db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
    verification_profile = {
        "work_history": [
            {key: value for key, value in item.items() if key != "id"}
            for item in (profile.work_history or [])
            if isinstance(item, dict)
        ]
        if profile
        else None,
        "skills": profile.skills if profile else None,
    }
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
    skipped = 0

    def verify_content(report, candidates, *, input_sources=None):
        _verify_report_sources(report, candidates)
        if input_sources is not None:
            index = {s["id"]: s for s in input_sources}
            for source in report["sources"]:
                expected = index.get(source["id"])
                _require(expected is not None)
                assert expected is not None
                for key in ("kind", "offset", "segment_id", "role", "start", "end"):
                    _require(source.get(key) == expected.get(key))
        for finding in report["findings"]:
            validate_section(
                {"findings": [finding], "limitations": []},
                report["sources"],
                report["scope"],
            )

    try:
        for row in models.get("Round", []):
            original = row.get("interview_report")
            if original is None:
                continue
            new_round = id_mapper.get("Round", row["id"])
            owned_round = (
                select(Round.id)
                .join(Application)
                .where(Round.id == new_round, Application.user_id == user_id)
            )
            _require(await db.scalar(owned_round) == new_round)
            restored = await db.scalar(
                select(Round.interview_report).where(Round.id.in_(owned_round))
            )
            saved = original.get("evidence_snapshot")
            if saved is not None:
                candidates = [{s["id"]: s["text"] for s in saved["sources"]}]
                checked = original
            else:
                data, _ = await snapshot(db, user_id, new_round)
                data["profile"] = verification_profile
                expected, _ = await evidence_sources(data)
                candidates = [_expected_index(expected, inverse)]
                checked = restored
            try:
                verify_content(
                    checked,
                    candidates,
                    input_sources=saved["sources"] if saved else expected,
                )
            except ValueError:
                skipped += 1
                await db.execute(
                    update(Round)
                    .where(Round.id.in_(owned_round))
                    .values(interview_report=None, interview_report_reason=None)
                )
        for row in models.get("Application", []):
            original = row.get("report")
            if original is None:
                continue
            new_app = id_mapper.get("Application", row["id"])
            owned_app = (Application.id == new_app, Application.user_id == user_id)
            restored = await db.scalar(select(Application.report).where(*owned_app))
            _require(restored is not None)
            saved = original.get("evidence_snapshot")
            if saved is not None:
                variants = [{s["id"]: s["text"] for s in saved["sources"]}]
                checked = original
            else:
                data, _ = await application_snapshot(db, user_id, new_app)
                data["profile"] = verification_profile
                variants = []
                for include in (True, False):
                    expected, _ = await application_evidence_sources(
                        data,
                        include_round_reports=include,
                        include_imported_reports=True,
                    )
                    variants.append(_expected_index(expected, inverse))
                checked = restored
            try:
                verify_content(
                    checked,
                    variants,
                    input_sources=saved["sources"] if saved else None,
                )
            except ValueError:
                skipped += 1
                await db.execute(
                    update(Application)
                    .where(*owned_app)
                    .values(report=None, report_reason=None)
                )
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
            data["profile"] = verification_profile
            archived_report = next(
                (
                    r["pipeline_report"]
                    for r in models.get("User", [])
                    if r.get("pipeline_report") is not None
                ),
                None,
            )
            if archived_report and archived_report.get("evidence_snapshot") is not None:
                # The input was checked before mutation. It includes the original
                # IDs and permissions, which import intentionally does not restore.
                expected, _ = await pipeline_evidence_sources(
                    archived_report["evidence_snapshot"]
                )
                try:
                    verify_content(report, [{s["id"]: s["text"] for s in expected}])
                except ValueError:
                    skipped += 1
                    await db.execute(
                        update(User)
                        .where(User.id == user_id)
                        .values(pipeline_report=None, pipeline_report_reason=None)
                    )
                return skipped
            data["metrics"].update(
                _archived_pipeline_insights(models, data["metrics"], inverse)
            )
            expected, _ = await pipeline_evidence_sources(data)
            historical = []
            if archived_report and archived_report.get("evidence_snapshot") is None:
                historical_data, _ = await pipeline_snapshot(
                    db,
                    user_id,
                    report["period"],
                    as_of,
                    report.get("time_zone") or "UTC",
                    archive_at=datetime.fromisoformat(report["run_at"]),
                )
                historical_data["profile"] = verification_profile
                historical_data["metrics"].update(
                    _archived_pipeline_insights(
                        models, historical_data["metrics"], inverse
                    )
                )
                historical, _ = await pipeline_evidence_sources(historical_data)
            legacy_metrics, _ = await pipeline_evidence_sources(
                data, include_workspace_metrics=False
            )
            # Older archives can cite unfiltered profile data; verify it locally only.
            legacy_profile = []
            _append_source(
                legacy_profile,
                "profile:work_history",
                "profile",
                data["profile"].get("work_history"),
            )
            pipeline_inverse = {
                **inverse,
                **{
                    current: original
                    for original, current in (archived_report or {})
                    .get("evidence_ids", {})
                    .items()
                },
            }
            try:
                verify_content(
                    report,
                    [
                        _expected_index(expected, pipeline_inverse),
                        _expected_index(legacy_metrics, pipeline_inverse),
                        _expected_index(legacy_profile, pipeline_inverse),
                        _expected_index(historical, pipeline_inverse),
                    ],
                )
            except ValueError:
                skipped += 1
                await db.execute(
                    update(User)
                    .where(User.id == user_id)
                    .values(pipeline_report=None, pipeline_report_reason=None)
                )
                return skipped
            # Preserve a locally verified legacy input for later round trips.
            # Privacy reset makes its old matrix freshness impossible to recover
            # on a second import. No imported permission or job is restored.
            candidates = [data]
            if historical:
                candidates.append(historical_data)
            for candidate in candidates:
                candidate_sources, _ = await pipeline_evidence_sources(candidate)
                try:
                    _verify_report_sources(
                        report, [_expected_index(candidate_sources, pipeline_inverse)]
                    )
                except ValueError:
                    continue
                saved = json.loads(
                    _restore_archived_ids(
                        json.dumps(candidate, default=str), pipeline_inverse
                    )
                )
                saved["as_of"] = report.get("as_of")
                report["evidence_snapshot"] = saved
                report["evidence_fingerprint"] = fingerprint(saved)
                if len(json.dumps(report)) > 1_000_000:
                    raise ValueError("Report exceeds retained output bound")
                await db.execute(
                    update(User)
                    .where(User.id == user_id)
                    .values(pipeline_report=report)
                )
                break
    except Exception as exc:  # noqa: BLE001 - convert to one outward archive error
        logger.warning(
            "Imported report evidence failed verification for user %s: %r",
            user_id,
            exc,
        )
        raise ValueError(GENERIC_ARCHIVE_ERROR) from None
    return skipped


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
    for finding in value.get("findings", []):
        for citation in finding_citations(finding):
            citation["source_id"] = refs[citation["source_id"]]
    return value


def remap_report(report, mapper, segment_ids, *, original_round_id=None):
    """Remap a latest report to imported identities; clears freshness proof."""
    value = deepcopy(report)
    value["fingerprint"] = ""
    value["config_revision"] = ""
    scope = value.get("scope")
    if scope != "PIPELINE" and value.get("evidence_snapshot") is not None:
        saved = deepcopy(value["evidence_snapshot"])
        value["evidence_snapshot"] = saved
        if saved.get("source_media_id"):
            saved["source_media_id"] = mapper.get(
                "RoundMedia", saved["source_media_id"]
            )
        _remap_sources(
            saved, mapper, segment_ids, original_round_id or report.get("round_id")
        )
        value["evidence_fingerprint"] = fingerprint(saved)
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
        old_aliases = value.get("evidence_ids", {})
        aliases = {}
        for key, new_id in mapper.mappings.items():
            model, _, old_id = key.partition(":")
            if model in ("Application", "Round", "ApplicationStatusHistory"):
                originals = [k for k, v in old_aliases.items() if v == old_id]
                for original in originals or [old_id]:
                    aliases[original] = new_id
        value["evidence_ids"] = aliases
    return value
