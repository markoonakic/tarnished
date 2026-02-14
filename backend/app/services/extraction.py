"""Job data extraction service.

This service handles the extraction of structured job posting data from HTML content
using the following pipeline:

    HTML Input
        |
        v
    Readability (extract main content)
        |
        v
    Markdownify (convert to markdown)
        |
        v
    LiteLLM (structured extraction with schema)
        |
        v
    Pydantic validation
        |
        v
    JobLeadExtractionInput

The service supports multiple LLM providers through LiteLLM and handles
various error conditions including timeouts, invalid responses, and
cases where no job data can be found.
"""

import json
import logging
from typing import Any

import openai
from markdownify import markdownify as md
from readability import Document
from litellm import completion

from app.schemas.job_lead import JobLeadExtractionInput

logger = logging.getLogger(__name__)

# Default model for extraction (can be overridden via parameter or env var)
DEFAULT_EXTRACTION_MODEL = "gpt-4o-mini"

# System prompt for job extraction
EXTRACTION_SYSTEM_PROMPT = """You are a job posting data extractor. Your task is to extract structured job posting information from the provided markdown content.

Instructions:
1. Carefully analyze the job posting content
2. Extract all available information matching the schema
3. If a field cannot be found in the content, set it to null (for optional fields) or an empty list (for list fields)
4. For salary information, extract the numeric values only (no currency symbols or text)
5. For dates, use ISO format (YYYY-MM-DD)
6. If the content does not appear to be a job posting (e.g., it's a login page, error page, or unrelated content), set all fields to null/empty
7. Be precise and only extract information that is clearly stated in the posting

The source URL is provided for context but the actual data should come from the content."""


def _extract_source_from_url(url: str) -> str | None:
    """Extract the source platform name from a URL.

    Args:
        url: The job posting URL.

    Returns:
        A source platform name (e.g., "LinkedIn", "Indeed") or None if unknown.
    """
    url_lower = url.lower()
    known_sources = {
        "linkedin": "LinkedIn",
        "indeed": "Indeed",
        "glassdoor": "Glassdoor",
        "monster": "Monster",
        "ziprecruiter": "ZipRecruiter",
        "dice": "Dice",
        "angel.co": "Wellfound",
        "wellfound": "Wellfound",
        "lever.co": "Lever",
        "greenhouse": "Greenhouse",
        "workday": "Workday",
        "smartrecruiters": "SmartRecruiters",
        "jobvite": "Jobvite",
        "brassring": "BrassRing",
        "icims": "iCIMS",
        "myworkdayjobs": "Workday",
    }
    for domain, source in known_sources.items():
        if domain in url_lower:
            return source
    return None


class ExtractionError(Exception):
    """Base exception for extraction errors."""

    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class ExtractionTimeoutError(ExtractionError):
    """Raised when the LLM request times out."""

    pass


class ExtractionInvalidResponseError(ExtractionError):
    """Raised when the LLM returns an invalid or unparseable response."""

    pass


class NoJobFoundError(ExtractionError):
    """Raised when no job posting data can be extracted from the content."""

    pass


# Size limits for HTML preprocessing
MAX_HTML_SIZE = 100_000  # 100KB max input HTML size
MAX_MARKDOWN_SIZE = 50_000  # 50KB max output markdown size


def preprocess_html(html: str) -> str:
    """Preprocess HTML content for LLM extraction.

    Uses Readability to extract the main content and converts it to
    clean markdown format for better LLM processing.

    The preprocessing pipeline:
    1. Validate input (non-empty, within size limits)
    2. Truncate if over size limit (preserves partial content)
    3. Extract main content using Readability
    4. Convert to markdown using Markdownify
    5. Validate output (non-empty after processing)
    6. Truncate markdown if necessary

    Args:
        html: Raw HTML content from a job posting page.

    Returns:
        Cleaned markdown string containing the main content.

    Raises:
        ValueError: If the HTML content is empty, invalid, or results in
            empty markdown after processing.
    """
    # Step 1: Validate input is not empty
    if not html or not html.strip():
        raise ValueError("HTML content cannot be empty")

    original_size = len(html)
    logger.debug(f"Processing HTML content: {original_size} characters")

    # Step 2: Truncate if over size limit
    if original_size > MAX_HTML_SIZE:
        logger.warning(
            f"HTML content ({original_size} chars) exceeds limit "
            f"({MAX_HTML_SIZE} chars), truncating"
        )
        html = html[:MAX_HTML_SIZE]
        # Try to close any unclosed tags by appending basic closing tags
        # This is a best-effort attempt to maintain valid HTML structure
        html += "</div></body></html>"

    # Step 3: Extract main content using Readability
    try:
        doc = Document(html)
        article_html = doc.summary()
    except Exception as e:
        logger.error(f"Readability failed to parse HTML: {e}")
        raise ValueError(f"Failed to extract content from HTML: {e}") from e

    # Validate Readability extracted something
    if not article_html or not article_html.strip():
        raise ValueError("Readability extracted empty content from HTML")

    logger.debug(f"Readability extracted {len(article_html)} chars of HTML")

    # Step 4: Convert to markdown
    try:
        markdown_content = md(article_html)
    except Exception as e:
        logger.error(f"Markdownify failed to convert HTML: {e}")
        raise ValueError(f"Failed to convert HTML to markdown: {e}") from e

    # Step 5: Validate output is not empty
    if not markdown_content or not markdown_content.strip():
        raise ValueError("Markdown conversion resulted in empty content")

    # Clean up excessive whitespace while preserving structure
    markdown_content = _clean_markdown(markdown_content)

    # Step 6: Truncate markdown if necessary
    if len(markdown_content) > MAX_MARKDOWN_SIZE:
        logger.warning(
            f"Markdown content ({len(markdown_content)} chars) exceeds limit "
            f"({MAX_MARKDOWN_SIZE} chars), truncating"
        )
        markdown_content = _truncate_markdown(markdown_content, MAX_MARKDOWN_SIZE)

    logger.debug(
        f"Preprocessed HTML: {original_size} -> {len(markdown_content)} chars "
        f"({len(markdown_content) / original_size * 100:.1f}% of original)"
    )

    return markdown_content


def _clean_markdown(markdown: str) -> str:
    """Clean up markdown content by removing excessive whitespace.

    Args:
        markdown: Raw markdown string.

    Returns:
        Cleaned markdown with normalized whitespace.
    """
    import re

    # Replace 3+ consecutive newlines with 2 (preserve paragraph breaks)
    markdown = re.sub(r"\n{3,}", "\n\n", markdown)

    # Remove trailing whitespace from each line
    markdown = "\n".join(line.rstrip() for line in markdown.split("\n"))

    # Remove leading/trailing whitespace from the whole document
    markdown = markdown.strip()

    return markdown


def _truncate_markdown(markdown: str, max_length: int) -> str:
    """Truncate markdown while preserving document structure.

    Attempts to truncate at a paragraph boundary to avoid cutting
    off in the middle of content.

    Args:
        markdown: Markdown string to truncate.
        max_length: Maximum allowed length.

    Returns:
        Truncated markdown string with ellipsis indicator.
    """
    if len(markdown) <= max_length:
        return markdown

    # Try to find a good break point (paragraph boundary)
    # Look for double newline before the max length
    truncate_point = max_length
    paragraph_break = markdown.rfind("\n\n", 0, max_length)

    if paragraph_break > max_length // 2:
        # Use paragraph break if it's in the latter half
        truncate_point = paragraph_break

    truncated = markdown[:truncate_point].rstrip()
    truncation_notice = "\n\n... [Content truncated due to size limit] ..."

    return truncated + truncation_notice


def extract_with_llm(
    markdown_content: str,
    url: str,
    model: str | None = None,
    timeout: int = 60,
) -> JobLeadExtractionInput:
    """Extract structured job data using LiteLLM.

    Uses structured output with the JobLeadExtractionInput schema to ensure
    the LLM returns valid, parseable job data.

    Args:
        markdown_content: Preprocessed markdown content from the job posting.
        url: The source URL (included in prompt for context).
        model: Optional model override (e.g., "gpt-4", "claude-3-opus").
               Falls back to DEFAULT_EXTRACTION_MODEL if not specified.
        timeout: Request timeout in seconds.

    Returns:
        JobLeadExtractionInput with extracted job data.

    Raises:
        ExtractionTimeoutError: If the LLM request times out.
        ExtractionInvalidResponseError: If the response cannot be parsed.
        NoJobFoundError: If no job data could be extracted.
    """
    import os

    # Determine which model to use
    extraction_model = model or os.getenv("LITELLM_MODEL", DEFAULT_EXTRACTION_MODEL)
    logger.info(f"Starting LLM extraction with model: {extraction_model}")

    # Build the user message with URL context and content
    user_message = f"""Source URL: {url}

Job Posting Content:
{markdown_content}"""

    try:
        # Call LiteLLM with structured output
        response = completion(
            model=extraction_model,
            messages=[
                {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            response_format=JobLeadExtractionInput,
            timeout=timeout,
        )

        # Extract the content from the response
        raw_content = response.choices[0].message.content

        if not raw_content:
            raise ExtractionInvalidResponseError(
                "LLM returned empty response",
                details={"model": extraction_model, "url": url},
            )

        logger.debug(f"Raw LLM response: {raw_content[:500]}...")

        # Parse the JSON response
        try:
            parsed_data = json.loads(raw_content)
        except json.JSONDecodeError as e:
            raise ExtractionInvalidResponseError(
                f"Failed to parse LLM response as JSON: {e}",
                details={
                    "model": extraction_model,
                    "url": url,
                    "raw_response": raw_content[:1000],
                },
            ) from e

        # Validate and create the Pydantic model
        try:
            job_data = JobLeadExtractionInput(**parsed_data)
        except Exception as e:
            raise ExtractionInvalidResponseError(
                f"LLM response failed schema validation: {e}",
                details={
                    "model": extraction_model,
                    "url": url,
                    "parsed_data": parsed_data,
                    "validation_error": str(e),
                },
            ) from e

        # Check if this appears to be an actual job posting
        # If both title and company are None, likely not a job posting
        if job_data.title is None and job_data.company is None:
            raise NoJobFoundError(
                "No job posting data could be extracted from the content",
                details={
                    "url": url,
                    "content_preview": markdown_content[:500],
                },
            )

        # Override source with URL-derived source if not extracted
        if job_data.source is None:
            job_data.source = _extract_source_from_url(url)

        logger.info(
            f"Successfully extracted job: {job_data.title} at {job_data.company}"
        )
        return job_data

    except openai.APITimeoutError as e:
        logger.error(f"LLM request timed out: {e}")
        raise ExtractionTimeoutError(
            f"LLM request timed out after {timeout} seconds",
            details={"model": extraction_model, "url": url, "timeout": timeout},
        ) from e

    except openai.APIError as e:
        logger.error(f"LLM API error: {e}")
        raise ExtractionInvalidResponseError(
            f"LLM API error: {e}",
            details={
                "model": extraction_model,
                "url": url,
                "error_type": type(e).__name__,
            },
        ) from e

    except (ExtractionTimeoutError, ExtractionInvalidResponseError, NoJobFoundError):
        # Re-raise our custom exceptions
        raise

    except Exception as e:
        logger.error(f"Unexpected error during LLM extraction: {e}")
        raise ExtractionInvalidResponseError(
            f"Unexpected error during extraction: {e}",
            details={
                "model": extraction_model,
                "url": url,
                "error_type": type(e).__name__,
            },
        ) from e


async def extract_job_data(
    html: str,
    url: str,
    model: str | None = None,
    timeout: int = 60,
) -> JobLeadExtractionInput:
    """Main entry point for job data extraction.

    Orchestrates the full extraction pipeline:
    1. Preprocess HTML to clean markdown
    2. Extract structured data using LLM
    3. Validate and return results

    Args:
        html: Raw HTML content from the job posting page.
        url: The source URL of the job posting.
        model: Optional LLM model override.
        timeout: LLM request timeout in seconds.

    Returns:
        JobLeadExtractionInput with all extracted job data.

    Raises:
        ExtractionError: Base class for all extraction errors.
        ExtractionTimeoutError: If the LLM request times out.
        ExtractionInvalidResponseError: If the response is invalid.
        NoJobFoundError: If no job data could be found.

    Example:
        ```python
        html = await fetch_job_posting(url)
        try:
            job_data = await extract_job_data(html, url)
            print(f"Found job: {job_data.title} at {job_data.company}")
        except NoJobFoundError:
            print("No job posting found at this URL")
        except ExtractionError as e:
            print(f"Extraction failed: {e.message}")
        ```
    """
    logger.info(f"Starting extraction for URL: {url}")

    # Step 1: Preprocess HTML
    try:
        markdown_content = preprocess_html(html)
    except ValueError as e:
        logger.error(f"HTML preprocessing failed: {e}")
        raise ExtractionError(f"Failed to preprocess HTML: {e}")

    # Step 2: Extract with LLM
    # TODO: Make this async once LLM extraction is implemented
    job_data = extract_with_llm(
        markdown_content=markdown_content,
        url=url,
        model=model,
        timeout=timeout,
    )

    logger.info(f"Successfully extracted job: {job_data.title} at {job_data.company}")
    return job_data
