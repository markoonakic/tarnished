"""Canonical Unicode and original posting spans, without spelling substitutions."""

import re
import unicodedata
from datetime import date
from typing import Any


def normalize_text(value: Any) -> Any:
    """Use NFC for source text and citations; keep spacing and punctuation intact."""
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, list):
        return [normalize_text(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize_text(item) for key, item in value.items()}
    return value


def source_value(value: str, quote: str) -> str:
    """Keep exact selections; replace retyped prose with the verified source span."""
    value, quote = normalize_text(value), normalize_text(quote)
    if value in quote:
        return value
    # Strip only posting-list markup and surrounding whitespace, not letters.
    return re.sub(r"^(?:[-*+] |\d+[.)] )", "", quote.strip()).strip()


_DEADLINE = re.compile(
    r"(?:apply\s+by|application\s+deadline|applications?\s+(?:close|until)|"
    r"closing\s+date|rok\s+(?:za\s+)?prijav[ue]|konkurs\s+(?:traje\s+)?do|"
    r"рок\s+(?:за\s+)?пријав[уе]|конкурс\s+(?:траје\s+)?до|validThrough)"
    r"[\s\":=-]*(?P<date>\d{4}-\d{2}-\d{2}|\d{1,2}\.\s*\d{1,2}\.\s*\d{4})",
    re.IGNORECASE,
)


def quoted_dates(text: str) -> set[str]:
    """Canonical dates stated in a verified quote, without inventing a day."""
    dates = set()
    for match in re.finditer(
        r"(?<!\d)(\d{4}-\d{2}-\d{2}|\d{1,2}\.\s*\d{1,2}\.\s*\d{4})(?!\d)", text
    ):
        raw = match.group()
        try:
            if "." in raw:
                day, month, year = (int(part.strip()) for part in raw.split("."))
                parsed = date(year, month, day)
            else:
                parsed = date.fromisoformat(raw)
        except ValueError:
            continue
        dates.add(parsed.isoformat())
    return dates


def explicit_deadlines(text: str) -> list[tuple[str, str]]:
    """Only labelled application dates; never infer one from an unrelated date."""
    results = []
    for match in _DEADLINE.finditer(normalize_text(text)):
        for day in quoted_dates(match["date"]):
            results.append((day, match.group()))
    return results
