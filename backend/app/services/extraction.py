"""Extract validated job data from page text or Readability-cleaned HTML."""

import json
import logging
from typing import Any
from uuid import uuid4

import openai
from litellm import completion
from markdownify import markdownify as md
from readability import Document
from starlette.concurrency import run_in_threadpool

from app.schemas.job_lead import JobLeadExtractionInput
from app.services.output_language import output_language_instruction

logger = logging.getLogger(__name__)

# Default model for extraction (can be overridden via parameter or env var)
DEFAULT_EXTRACTION_MODEL = "openai/gpt-4o-mini"

# System prompt for job extraction
EXTRACTION_SYSTEM_PROMPT = """You are a job posting data extractor. Your task is to extract structured job posting information from the provided text content and return it as valid JSON.

You must respond with ONLY a valid JSON object (no markdown code blocks, no extra text) with these fields:
- title: string or null - The job title (e.g., "Senior Software Engineer")
- company: string or null - The company name
- description: string or null - Full job description, including all stated pay basis and employment terms (plain text; preserve important details, not just a short role summary)
- location: string or null - Job location (e.g., "San Francisco, CA" or "Remote")
- salary_min: integer or null - Minimum salary (numeric only, no currency symbols)
- salary_max: integer or null - Maximum salary (numeric only, no currency symbols)
- salary_currency: string or null - Currency code (e.g., "USD", "EUR")
- recruiter_name: string or null - Name of recruiter if mentioned
- recruiter_title: string or null - Title of recruiter (e.g., "Technical Recruiter")
- recruiter_linkedin_url: string or null - LinkedIn URL of recruiter if available
- requirements_must_have: array of strings - Must-have requirements (required qualifications)
- requirements_nice_to_have: array of strings - Nice-to-have requirements (preferred qualifications)
- skills: array of strings - Technical or soft skills required
- years_experience_min: integer or null - Minimum years of experience
- years_experience_max: integer or null - Maximum years of experience
- source: string or null - Source platform (e.g., "LinkedIn", "Indeed")
- posted_date: string or null - Date posted in YYYY-MM-DD format

Instructions:
1. Carefully analyze the job posting content - ignore navigation, headers, footers, and unrelated text
2. Extract ALL available information - be thorough, don't skip fields
3. If a field cannot be found, use null for optional fields or empty array [] for list fields
4. For salary_min/salary_max, extract only numeric values (no currency symbols or text). Do not convert monthly to annual pay or net to gross. Preserve the stated net/gross basis and per month/year/hour period in description, alongside the amount and currency. If the basis or period is absent, leave it unknown.
   Preserve employment type, contract duration, working hours, probation, benefits and conditions in description when stated. Keep negations and timing exactly in meaning, such as "no initial on-call duty"; do not shorten this to "on-call duty" or assume it never applies. Do not invent terms.
5. For dates, use ISO format (YYYY-MM-DD)
6. Look for sections like "Requirements", "Qualifications", "Responsibilities", "Skills", "About the Role"
7. If content is not a job posting, set all fields to null/empty
8. Return ONLY valid JSON, no markdown code blocks or extra text

The source URL is provided for context but data should come from the content."""

# Correction prompt for retry when LLM returns invalid JSON
CORRECTION_PROMPT_TEMPLATE = """The previous response could not be parsed as valid JSON. Please try again with a properly formatted JSON response.

Error encountered: {error_message}

Original response (first 500 chars):
{original_response}

Remember:
1. Return ONLY valid JSON - no extra text, no markdown code blocks
2. Ensure all string values are properly quoted
3. Ensure all brackets and braces are properly closed
4. Use null for missing optional fields, empty lists [] for missing list fields"""


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


class ExtractionAuthError(ExtractionError):
    """Raised when the AI API key is missing or invalid."""

    pass


class NoJobFoundError(ExtractionError):
    """Raised when no job posting data can be extracted from the content."""

    pass


# Size limits for HTML preprocessing
MAX_HTML_SIZE = 100_000  # characters max input HTML size
MAX_MARKDOWN_SIZE = 50_000  # characters max output markdown size


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
    truncation_notice = "\n\n... [Content truncated due to size limit] ..."
    budget = max(0, max_length - len(truncation_notice))
    truncate_point = budget
    paragraph_break = markdown.rfind("\n\n", 0, budget)

    if paragraph_break > max_length // 2:
        # Use paragraph break if it's in the latter half
        truncate_point = paragraph_break

    truncated = markdown[:truncate_point].rstrip()
    return (truncated + truncation_notice)[:max_length]


def extract_with_llm(
    content: str,
    url: str,
    model: str | None = None,
    api_key: str | None = None,
    api_base: str | None = None,
    timeout: int = 60,
    retry_invalid_response: bool = True,
    output_language: str = "en",
) -> JobLeadExtractionInput:
    """Extract structured job data using LiteLLM.

    Uses structured output with the JobLeadExtractionInput schema to ensure
    the LLM returns valid, parseable job data.

    Includes retry logic: if the LLM returns invalid JSON, it will retry once
    with a correction prompt before failing.

    Args:
        content: Text content from the job posting (plain text or preprocessed).
        url: The source URL (included in prompt for context).
        model: Optional model override (e.g., "gpt-4", "cerebras/llama-3.3-70b").
               Falls back to DEFAULT_EXTRACTION_MODEL if not specified.
        api_key: Optional API key for the LLM provider.
        api_base: Optional base URL for the LLM provider.
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
{content}"""

    system_prompt = EXTRACTION_SYSTEM_PROMPT + output_language_instruction(
        output_language
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    # Build kwargs for LiteLLM completion
    # Use json_object mode instead of full schema for broader compatibility
    # (Cerebras and other providers don't support full JSON schema)
    completion_kwargs = {
        "model": extraction_model,
        "messages": messages,
        "response_format": {"type": "json_object"},
        "timeout": timeout,
        # One opaque context per extraction, also retained during JSON repair.
        "extra_headers": {"x-opencode-session": str(uuid4())},
    }

    # Add API key and base URL if provided
    if api_key:
        completion_kwargs["api_key"] = api_key
    if api_base:
        completion_kwargs["api_base"] = api_base

    # Check for API key before making the request
    if not api_key:
        logger.error("AI API key not configured")
        raise ExtractionAuthError(
            "AI API key not configured. Please add your API key in Settings.",
            details={"model": extraction_model, "url": url},
        )

    # Allow one retry for invalid JSON responses
    max_attempts = 2 if retry_invalid_response else 1
    if not retry_invalid_response:
        # Disable LiteLLM/provider-adapter retries as well as our JSON repair.
        completion_kwargs["num_retries"] = 0
        completion_kwargs["max_retries"] = 0

    for attempt in range(max_attempts):
        try:
            # Call LiteLLM with structured output
            response = completion(**completion_kwargs)

            # Extract the content from the response
            raw_content = response.choices[0].message.content  # type: ignore[union-attr]

            if not raw_content:
                raise ExtractionInvalidResponseError(
                    "LLM returned empty response",
                    details={"model": extraction_model, "url": url},
                )

            # Parse the JSON response
            try:
                parsed_data = json.loads(raw_content)
            except json.JSONDecodeError as e:
                if attempt < max_attempts - 1:
                    # Retry with correction prompt
                    logger.warning(
                        f"JSON parse error on attempt {attempt + 1}, retrying with correction prompt"
                    )
                    correction_prompt = CORRECTION_PROMPT_TEMPLATE.format(
                        error_message=str(e),
                        original_response=raw_content[:500],
                    )
                    messages = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                        {"role": "assistant", "content": raw_content},
                        {"role": "user", "content": correction_prompt},
                    ]
                    completion_kwargs["messages"] = messages
                    continue
                raise ExtractionInvalidResponseError(
                    f"Failed to parse LLM response as JSON after {max_attempts} attempts",
                    details={"attempts": max_attempts},
                ) from None

            # Validate and create the Pydantic model
            try:
                job_data = JobLeadExtractionInput(**parsed_data)
            except Exception as e:
                if attempt < max_attempts - 1:
                    # Retry with correction prompt for schema validation errors
                    logger.warning(
                        f"Schema validation error on attempt {attempt + 1}, retrying with correction prompt"
                    )
                    correction_prompt = CORRECTION_PROMPT_TEMPLATE.format(
                        error_message=f"Schema validation failed: {e}",
                        original_response=raw_content[:500],
                    )
                    messages = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                        {"role": "assistant", "content": raw_content},
                        {"role": "user", "content": correction_prompt},
                    ]
                    completion_kwargs["messages"] = messages
                    continue
                raise ExtractionInvalidResponseError(
                    f"LLM response failed schema validation after {max_attempts} attempts",
                    details={"attempts": max_attempts},
                ) from None

            # Check if this appears to be an actual job posting
            # If both title and company are None, likely not a job posting
            if job_data.title is None and job_data.company is None:
                raise NoJobFoundError(
                    "No job posting data could be extracted from the content",
                )

            # Override source with URL-derived source if not extracted
            if job_data.source is None:
                job_data.source = _extract_source_from_url(url)

            logger.info("Job extraction completed after %s attempt(s)", attempt + 1)
            return job_data

        except openai.APITimeoutError:
            logger.error("LLM request timed out")
            raise ExtractionTimeoutError(
                f"LLM request timed out after {timeout} seconds",
                details={"model": extraction_model, "url": url, "timeout": timeout},
            ) from None

        except openai.AuthenticationError:
            logger.error("LLM authentication error")
            raise ExtractionAuthError(
                "AI API key is invalid or expired. Please check your API key in Settings.",
                details={"model": extraction_model, "url": url},
            ) from None

        except openai.RateLimitError:
            logger.error("LLM rate limit error")
            raise ExtractionTimeoutError(
                "AI service is rate limited. Please wait a moment and try again.",
                details={"model": extraction_model, "url": url},
            ) from None

        except openai.APIError as e:
            logger.error("LLM API error")
            raise ExtractionInvalidResponseError(
                "LLM API error. Ask an administrator to check the text configuration.",
                details={
                    "model": extraction_model,
                    "url": url,
                    "error_type": type(e).__name__,
                },
            ) from None

        except (
            ExtractionTimeoutError,
            ExtractionInvalidResponseError,
            ExtractionAuthError,
            NoJobFoundError,
        ):
            # Re-raise our custom exceptions
            raise

        except Exception as e:
            logger.error("Unexpected error during LLM extraction")
            raise ExtractionInvalidResponseError(
                "Unexpected text service error. Ask an administrator to check the configuration.",
                details={
                    "model": extraction_model,
                    "url": url,
                    "error_type": type(e).__name__,
                },
            ) from None

    # This should never be reached, but satisfy the type checker
    raise ExtractionInvalidResponseError(
        "Extraction failed after all attempts",
        details={"model": extraction_model, "url": url},
    )


async def extract_with_llm_async(
    content: str,
    url: str,
    model: str | None = None,
    api_key: str | None = None,
    api_base: str | None = None,
    timeout: int = 60,
    retry_invalid_response: bool = True,
    output_language: str = "en",
) -> JobLeadExtractionInput:
    """Run blocking LLM extraction off the event loop."""
    return await run_in_threadpool(
        extract_with_llm,
        content,
        url,
        model,
        api_key,
        api_base,
        timeout,
        retry_invalid_response,
        output_language,
    )


async def extract_job_data(
    html: str | None = None,
    text: str | None = None,
    url: str = "",
    model: str | None = None,
    api_key: str | None = None,
    api_base: str | None = None,
    timeout: int = 60,
    retry_invalid_response: bool = True,
    output_language: str = "en",
) -> JobLeadExtractionInput:
    """Main entry point for job data extraction.

    Supports two modes:
    1. Text mode (preferred): Pass text directly, skips preprocessing entirely
    2. HTML mode (legacy): Pass HTML, preprocesses to markdown first

    Args:
        html: Raw HTML content from the job posting page (legacy mode).
        text: Plain text content from the job posting page (preferred mode).
        url: The source URL of the job posting.
        model: Optional LLM model override.
        api_key: Optional API key for the LLM provider.
        api_base: Optional base URL for the LLM provider.
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
        # Preferred: text mode
        text = document.body.innerText
        job_data = await extract_job_data(text=text, url=url)

        # Legacy: HTML mode
        html = await fetch_job_posting(url)
        job_data = await extract_job_data(html=html, url=url)
        ```
    """
    logger.info("Starting requested job extraction")

    # Determine content to use
    content: str

    if text:
        # Preferred: use text directly, no preprocessing
        logger.info(f"Using text mode ({len(text)} chars)")
        content = text.strip()
        if not content:
            raise ExtractionError("Text content is empty")
    elif html:
        # Legacy: preprocess HTML to markdown
        logger.info(f"Using HTML mode ({len(html)} chars)")
        try:
            content = await run_in_threadpool(preprocess_html, html)
        except ValueError as e:
            logger.error(f"HTML preprocessing failed: {e}")
            raise ExtractionError(f"Failed to preprocess HTML: {e}")
    else:
        raise ExtractionError("Either 'text' or 'html' must be provided")

    # Extract with LLM
    job_data = await extract_with_llm_async(
        content=content,
        url=url,
        model=model,
        api_key=api_key,
        api_base=api_base,
        timeout=timeout,
        retry_invalid_response=retry_invalid_response,
        output_language=output_language,
    )

    logger.info("Job extraction completed")
    return job_data
