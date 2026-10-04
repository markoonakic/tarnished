"""Bounded, source-addressed interview output; never executable model instructions."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
)


class Citation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    source_id: str = Field(min_length=1, max_length=160)
    quote: str = Field(min_length=1, max_length=2000)


CoachingText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1200)
]
CitationIndex = Annotated[int, Field(strict=True, ge=0, le=15)]


def _display_indices(value):
    """Optional display pointers cannot invalidate otherwise grounded evidence."""
    if not isinstance(value, list):
        return []
    return list(dict.fromkeys(i for i in value if type(i) is int and 0 <= i <= 15))


DisplayCitationIndices = Annotated[
    list[CitationIndex], BeforeValidator(_display_indices)
]


class CoachingBase(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    version: int = Field(strict=True, ge=1, le=1)
    title: str = Field(min_length=1, max_length=120)


class InterviewCoaching(CoachingBase):
    kind: Literal["interview"]
    # The question has its own attribution; it cannot support candidate claims.
    question: Citation | None = None
    answer_citation: CitationIndex
    better_answer: CoachingText
    # The finding's action is the practice exercise, not a second task list.


class ConditionalStep(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    condition: CoachingText
    action: CoachingText


class ConditionalDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    condition: CoachingText
    text: CoachingText


class ApplicationCoaching(CoachingBase):
    kind: Literal["application"]
    # Check all usable pointers before reducing the visible selection to four.
    context_citations: DisplayCitationIndices = Field(
        default_factory=list, max_length=16
    )
    branches: list[ConditionalStep] = Field(min_length=1, max_length=4)
    draft: ConditionalDraft | None = None


class RecordStep(ConditionalStep):
    # References the exact JSON object in an existing validated citation.
    record_citation: CitationIndex
    round_citations: DisplayCitationIndices = Field(default_factory=list, max_length=16)


class PipelineCoaching(CoachingBase):
    kind: Literal["pipeline"]
    records: list[RecordStep] = Field(min_length=1, max_length=6)


class InterviewFinding(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    subject: Literal["candidate"]
    coaching: InterviewCoaching | None = None
    observation: str = Field(min_length=1, max_length=1200)
    interpretation: str = Field(min_length=1, max_length=1200)
    action: str = Field(min_length=1, max_length=1200)
    limitations: str = Field(min_length=1, max_length=1200)
    citations: list[Citation] = Field(min_length=1, max_length=6)


class InterviewSection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    findings: list[InterviewFinding] = Field(max_length=2)
    limitations: list[str] = Field(max_length=8)


class ScopedFinding(BaseModel):
    """A finding about an application or the pipeline, not a candidate's speech."""

    model_config = ConfigDict(extra="forbid", strict=True)
    subject: Literal["application", "pipeline"]
    coaching: (
        Annotated[ApplicationCoaching | PipelineCoaching, Field(discriminator="kind")]
        | None
    ) = None
    observation: str = Field(min_length=1, max_length=1200)
    interpretation: str = Field(min_length=1, max_length=1200)
    action: str = Field(min_length=1, max_length=1200)
    limitations: str = Field(min_length=1, max_length=1200)
    citations: list[Citation] = Field(min_length=1, max_length=6)


class ApplicationSection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    findings: list[ScopedFinding] = Field(max_length=3)
    limitations: list[str] = Field(max_length=8)


class PipelineFinding(ScopedFinding):
    # Only new sections without a complete, citable application record may use this.
    coaching_unavailable: Literal["complete_record_unavailable"] | None = None
    # Named applications, their rounds and a metric can need more than six passages.
    citations: list[Citation] = Field(min_length=1, max_length=16)
    # Older saved/checkpoint output has no topic; do not guess one on read.
    topic: Literal["pipeline", "interview", "activity"] | None = None


class PipelineSection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    findings: list[PipelineFinding] = Field(max_length=3)
    limitations: list[str] = Field(max_length=8)


class PipelineOutputFinding(PipelineFinding):
    """Provider instructions only; saved reports keep the global scope union."""

    subject: Literal["pipeline"]
    coaching: PipelineCoaching | None = None


class PipelineOutputSection(PipelineSection):
    findings: list[PipelineOutputFinding] = Field(max_length=3)


class InterviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    intent_id: UUID
    generation: int = Field(ge=0)
    config_revision: str = Field(min_length=1, max_length=36)


class ScopedReportRequest(BaseModel):
    """Application-scope request. Generation guards the application's report chain."""

    model_config = ConfigDict(extra="forbid")
    intent_id: UUID
    generation: int = Field(ge=0)
    config_revision: str = Field(min_length=1, max_length=36)


class PipelineReportRequest(BaseModel):
    """Pipeline-scope request. Period/as-of select the deterministic cohort."""

    model_config = ConfigDict(extra="forbid")
    intent_id: UUID
    config_revision: str = Field(min_length=1, max_length=36)
    period: Literal["7d", "30d", "3m", "all"] = "30d"
    as_of: datetime | None = None


def validate_document_text(text: str) -> str:
    """Shared paste/archive boundary: bounded text that SQL can UTF-8 encode."""
    if not isinstance(text, str) or len(text) > 32000 or "\x00" in text:
        raise ValueError("Invalid document text")
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        raise ValueError("Invalid document text") from None
    return text


class DocumentTextPaste(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: Annotated[str, AfterValidator(validate_document_text)] = Field(
        max_length=32000
    )
    expected_revision: int = Field(ge=0)
