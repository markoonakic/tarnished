"""Small bounded contracts shared by transport validation and review."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    StrictStr,
    field_validator,
    model_validator,
)
from pydantic_core import PydanticCustomError

SCALAR_OPTIONS = {
    "work_mode": ("office", "hybrid", "remote", "other"),
    "employment_type": (
        "full_time",
        "part_time",
        "contract",
        "internship",
        "temporary",
        "other",
    ),
    "pay_period": ("hour", "day", "week", "month", "year", "other"),
}

PROPOSAL_STRING_LIMITS = {
    "title": 255,
    "company": 255,
    "location": 255,
    "seniority": 50,
    "salary_currency": 10,
    "recruiter_name": 255,
    "recruiter_title": 255,
    "recruiter_linkedin_url": 512,
}
MAX_PAY = 1_000_000_000

Kind = Literal["EXTRACTION", "PROFILE_MATCH", "PREPARATION"]
FieldName = Literal[
    "title",
    "company",
    "location",
    "work_mode",
    "employment_type",
    "seniority",
    "salary_min",
    "salary_max",
    "salary_currency",
    "pay_period",
    "responsibilities",
    "must_have",
    "nice_to_have",
    "experience",
    "education",
    "languages",
    "certificates",
    "other_conditions",
    "recruiter_name",
    "recruiter_title",
    "recruiter_linkedin_url",
    "posted_date",
    "deadline",
]
Category = Literal[
    "review_topics",
    "technical_topics",
    "practice_questions",
    "company_questions",
    "examples",
    "profile_gaps",
    "plan",
]
CATEGORIES = (
    "review_topics",
    "technical_topics",
    "practice_questions",
    "company_questions",
    "examples",
    "profile_gaps",
    "plan",
)
REQUIREMENTS = (
    "must_have",
    "nice_to_have",
    "experience",
    "education",
    "languages",
    "certificates",
    "other_conditions",
)


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("*")
    @classmethod
    def meaningful_text(cls, value):
        if isinstance(value, str) and (not value.strip() or "\x00" in value):
            raise PydanticCustomError(
                "text_meaningful", "Text must be non-empty and cannot contain NUL"
            )
        return value


class ConfirmRequirements(Strict):
    lead_id: UUID | None = None
    application_id: UUID | None = None
    expected_revision: int = Field(ge=0)

    @model_validator(mode="after")
    def one_target(self):
        if bool(self.lead_id) == bool(self.application_id):
            raise ValueError("Exactly one target is required")
        return self


class Proposal(Strict):
    id: str = Field(min_length=1, max_length=80)
    field: FieldName
    value: Annotated[StrictStr, Field(min_length=1, max_length=4000)] | StrictInt
    quote: str = Field(min_length=1, max_length=2000)

    @field_validator("value")
    @classmethod
    def value_type(cls, value, info):
        field = info.data.get("field")
        if field in ("salary_min", "salary_max"):
            try:
                if not str(value).isdigit() or not 0 <= int(value) <= MAX_PAY:
                    raise ValueError
            except ValueError:
                raise PydanticCustomError("proposal_pay", "Invalid pay") from None
            return int(value)
        if not isinstance(value, str):
            raise PydanticCustomError("proposal_type", "Invalid proposal")
        if field in SCALAR_OPTIONS and value not in SCALAR_OPTIONS[field]:
            raise PydanticCustomError("proposal_option", "Invalid option")
        if len(value) > PROPOSAL_STRING_LIMITS.get(field, 4000):
            raise PydanticCustomError("proposal_length", "Value too long")
        if field in ("posted_date", "deadline"):
            from datetime import date

            try:
                if date.fromisoformat(value).isoformat() != value:
                    raise ValueError
            except ValueError:
                raise PydanticCustomError("proposal_date", "Invalid date") from None
        return value


class Extraction(Strict):
    items: list[Proposal] = Field(max_length=100)
    # Server-owned result metadata, never a provider field.
    unverified_count: Annotated[StrictInt, Field(ge=0, le=100)] = 0


class Citation(Strict):
    profile_id: str = Field(min_length=1, max_length=100)
    quote: str = Field(min_length=1, max_length=2000)


class MatchRow(Strict):
    requirement_id: str = Field(min_length=1, max_length=100)
    state: Literal["confirmed", "partial", "no_evidence", "unknown"]
    evidence: list[Citation] = Field(default_factory=list, max_length=5)
    why: str = Field(min_length=1, max_length=1000)


class Match(Strict):
    rows: list[MatchRow] = Field(max_length=100)


class DraftItem(Strict):
    id: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=2000)
    requirement_ids: list[str] = Field(default_factory=list, max_length=20)
    evidence: list[Citation] = Field(default_factory=list, max_length=5)


class RequirementDraftItem(DraftItem):
    requirement_ids: list[str] = Field(
        min_length=1,
        max_length=20,
        description="Cite at least one confirmed requirement ID from the input.",
    )


class ExampleDraftItem(DraftItem):
    evidence: list[Citation] = Field(
        min_length=1,
        max_length=5,
        description="Cite an allowed profile item and an exact quote from its text.",
    )


class Preparation(Strict):
    review_topics: list[RequirementDraftItem] = Field(max_length=20)
    technical_topics: list[RequirementDraftItem] = Field(max_length=20)
    practice_questions: list[RequirementDraftItem] = Field(max_length=20)
    company_questions: list[DraftItem] = Field(max_length=20)
    examples: list[ExampleDraftItem] = Field(max_length=20)
    profile_gaps: list[RequirementDraftItem] = Field(max_length=20)
    plan: list[DraftItem] = Field(max_length=20)


class CreateAnalysis(Strict):
    kind: Kind
    lead_id: UUID | None = None
    application_id: UUID | None = None
    round_id: UUID | None = None
    language: Literal["en", "sr-Latn"] = "en"


class RunAnalysis(Strict):
    intent_id: UUID
    expected_revision: int = Field(ge=0)


class ReviewItem(Strict):
    id: str = Field(min_length=1, max_length=80)
    decision: Literal["accepted", "edited", "rejected"]
    value: str | int | None = None
    company_id: UUID | None = None


class ReviewAnalysis(Strict):
    expected_revision: int = Field(ge=0)
    target_revision: int = Field(ge=0)
    items: list[ReviewItem] = Field(min_length=1, max_length=100)


class ApplyAnalysis(Strict):
    expected_revision: int = Field(ge=0)
    target_revision: int = Field(ge=0)
    selected_ids: list[str] = Field(min_length=1, max_length=140)


class DiscardAnalysis(Strict):
    expected_revision: int = Field(ge=0)
