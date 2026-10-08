"""Bounded untrusted source snapshots, reusing the extraction preprocessing path."""

from app.services.extraction import (
    MAX_HTML_SIZE,
    MAX_MARKDOWN_SIZE,
    _clean_markdown,
    _truncate_markdown,
    preprocess_html,
)


def capture_complete_source(text: str | None = None, html: str | None = None) -> dict:
    from fastapi import HTTPException

    if text is not None:
        if len(text) > 100_000 or "\x00" in text:
            raise HTTPException(
                422, "Source text limit is 100000 characters; NUL is not allowed"
            )
        return {
            "source_text": text or None,
            "source_truncated": False,
            "content_warning": None,
        }
    result = capture_source(None, html)
    if result["source_truncated"]:
        raise HTTPException(
            422, "Source exceeds storage limit; paste up to 100000 characters instead"
        )
    return result


def capture_source(text: str | None = None, html: str | None = None) -> dict:
    """Local only. These strings are data, not sanitized/trusted HTML."""
    truncated = False
    try:
        if text and text.strip():
            content = _clean_markdown(text)
        elif html and html.strip():
            truncated = len(html) > MAX_HTML_SIZE
            content = preprocess_html(html)
            truncated |= content.endswith(
                "... [Content truncated due to size limit] ..."
            )
        else:
            content = ""
        # PostgreSQL text cannot store NUL. Replace it before retaining source,
        # without joining words or losing an otherwise valid URL-only save.
        normalized = "\x00" in content
        if normalized:
            content = _clean_markdown(content.replace("\x00", " "))
        truncated |= len(content) > MAX_MARKDOWN_SIZE
        content = _truncate_markdown(content, MAX_MARKDOWN_SIZE)
        warning = (
            "Source content was truncated; only a partial posting is retained."
            if truncated
            else None
        )
        if not content:
            warning = "No useful source text was captured. Explicit extraction will attempt to fetch the URL."
        if normalized:
            warning = "NUL characters in source text were replaced with spaces." + (
                " " + warning if warning else ""
            )
        return {
            "source_text": content or None,
            "source_truncated": truncated,
            "content_warning": warning,
        }
    except Exception:
        # Optional content must never make a valid URL unsavable. Do not expose
        # parser internals or source fragments in a public error message.
        return {
            "source_text": None,
            "source_truncated": truncated,
            "content_warning": "Source preprocessing failed. The URL is saved; explicit extraction can try fetching it.",
        }
