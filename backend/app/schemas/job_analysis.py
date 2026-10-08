"""Small bounded contracts shared by transport validation and review."""

from typing import Literal
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
            raise ValueError("Text must be non-empty and cannot contain NUL")
        return value


class Proposal(Strict):
    id: str = Field(min_length=1, max_length=80)
    field: FieldName
    value: StrictStr | StrictInt
    quote: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def value_type(self):
        if self.field in ("salary_min", "salary_max"):
            if (
                isinstance(self.value, bool)
                or not str(self.value).isdigit()
                or not 0 <= int(self.value) <= 1_000_000_000
            ):
                raise ValueError("Invalid pay")
            self.value = int(self.value)
        elif (
            not isinstance(self.value, str)
            or not self.value.strip()
            or len(self.value) > 4000
        ):
            raise ValueError("Invalid proposal")
        if (
            self.field in SCALAR_OPTIONS
            and self.value not in SCALAR_OPTIONS[self.field]
        ):
            raise ValueError("Invalid option")
        if (
            self.field
            in (
                "title",
                "company",
                "location",
                "seniority",
                "recruiter_name",
                "recruiter_title",
            )
            and len(str(self.value)) > 255
        ):
            raise ValueError("Value too long")
        if self.field == "salary_currency" and len(str(self.value)) > 10:
            raise ValueError("Currency too long")
        if self.field == "seniority" and len(str(self.value)) > 50:
            raise ValueError("Seniority too long")
        if self.field == "recruiter_linkedin_url" and len(str(self.value)) > 512:
            raise ValueError("Profile URL too long")
        if self.field == "posted_date":
            from datetime import date

            date.fromisoformat(str(self.value))
        return self


class Extraction(Strict):
    items: list[Proposal] = Field(max_length=100)


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


class Preparation(Strict):
    review_topics: list[DraftItem] = Field(max_length=20)
    technical_topics: list[DraftItem] = Field(max_length=20)
    practice_questions: list[DraftItem] = Field(max_length=20)
    company_questions: list[DraftItem] = Field(max_length=20)
    examples: list[DraftItem] = Field(max_length=20)
    profile_gaps: list[DraftItem] = Field(max_length=20)
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
