"""Tests for job data extraction service.

Task 8.3: Test extraction service with sample job HTML

These tests verify that the extraction service works correctly,
including HTML preprocessing, LLM extraction, and error handling.
"""

# pyright: reportCallIssue=warning, reportArgumentType=warning
# Pydantic v2 optional fields cause false positives with pyright

import json
from unittest.mock import MagicMock, patch

import openai
import pytest

from app.schemas.job_lead import JobLeadExtractionInput
from app.services.extraction import (
    ExtractionError,
    ExtractionInvalidResponseError,
    ExtractionTimeoutError,
    NoJobFoundError,
    _extract_source_from_url,
    _truncate_markdown,
    extract_job_data,
    extract_with_llm,
    preprocess_html,
)

# Sample HTML for testing
SAMPLE_JOB_HTML = """<!DOCTYPE html>
<html>
<head><title>Software Engineer at Tech Corp</title></head>
<body>
<h1>Senior Software Engineer</h1>
<h2>Tech Corp - San Francisco, CA</h2>
<p>We are looking for a talented software engineer...</p>
<div class="salary">$150,000 - $200,000 per year</div>
</body>
</html>"""

SAMPLE_JOB_HTML_WITH_DETAILS = """<!DOCTYPE html>
<html>
<head><title>Full Stack Developer - Startup Inc</title></head>
<body>
<article>
<h1>Full Stack Developer</h1>
<div class="company-info">Startup Inc - Remote</div>
<div class="job-description">
<p>We are seeking an experienced Full Stack Developer to join our growing team.</p>
<p>You will work on building scalable web applications using modern technologies.</p>
</div>
<div class="salary">$120,000 - $180,000</div>
<div class="requirements">
<h3>Requirements:</h3>
<ul>
<li>5+ years of experience in software development</li>
<li>Proficiency in Python, JavaScript, and React</li>
<li>Experience with PostgreSQL and Redis</li>
</ul>
<h3>Nice to have:</h3>
<ul>
<li>Experience with Kubernetes</li>
<li>Machine learning background</li>
</ul>
</div>
<div class="recruiter">
<p>Contact: Jane Smith, Senior Recruiter</p>
<p>LinkedIn: https://linkedin.com/in/janesmith</p>
</div>
</article>
</body>
</html>"""

NON_JOB_HTML = """<!DOCTYPE html>
<html>
<head><title>Login - Example Site</title></head>
<body>
<h1>Please Log In</h1>
<form>
<input type="email" placeholder="Email">
<input type="password" placeholder="Password">
<button type="submit">Sign In</button>
</form>
</body>
</html>"""

INVALID_HTML_EMPTY = ""

INVALID_HTML_MINIMAL = "<html></html>"


class TestPreprocessHtml:
    """Test HTML preprocessing functionality."""

    def test_preprocess_valid_html(self):
        """Test preprocessing valid job HTML."""
        result = preprocess_html(SAMPLE_JOB_HTML)

        assert result is not None
        assert len(result) > 0
        # Should contain key job information
        assert "Software Engineer" in result or "Tech Corp" in result

    def test_preprocess_html_with_details(self):
        """Test preprocessing HTML with detailed job information."""
        result = preprocess_html(SAMPLE_JOB_HTML_WITH_DETAILS)

        assert result is not None
        assert len(result) > 0
        # Should extract meaningful content
        assert "Full Stack" in result or "Developer" in result

    def test_preprocess_empty_html_raises_error(self):
        """Test that empty HTML raises ValueError."""
        with pytest.raises(ValueError, match="cannot be empty"):
            preprocess_html(INVALID_HTML_EMPTY)

    def test_preprocess_whitespace_only_html_raises_error(self):
        """Test that whitespace-only HTML raises ValueError."""
        with pytest.raises(ValueError, match="cannot be empty"):
            preprocess_html("   \n\t   ")

    def test_preprocess_non_job_html_still_processes(self):
        """Test that non-job HTML is still processed (content extraction happens later)."""
        # Readability should still extract content from login pages
        result = preprocess_html(NON_JOB_HTML)
        assert result is not None
        # It should extract some content even from non-job pages
        assert "Log In" in result or "Sign In" in result

    def test_preprocess_large_html_truncates(self):
        """Test that large HTML is truncated to size limit."""
        # Create HTML larger than MAX_HTML_SIZE (100KB)
        large_content = (
            "<html><body>" + ("<p>Test content</p>" * 10000) + "</body></html>"
        )
        assert len(large_content) > 100_000

        result = preprocess_html(large_content)

        # Should still return valid markdown
        assert result is not None
        # Markdown output should be limited
        assert len(result) <= 60_000  # Some buffer over 50KB limit


class TestTruncateMarkdown:
    """Test markdown truncation functionality."""

    def test_short_markdown_not_truncated(self):
        """Test that short markdown is not modified."""
        markdown = "Short content"
        result = _truncate_markdown(markdown, 100)

        assert result == markdown

    def test_long_markdown_truncated_at_paragraph(self):
        """Test that long markdown is truncated at paragraph boundary."""
        markdown = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
        # Truncate to include first paragraph but not third
        result = _truncate_markdown(markdown, 40)

        assert "First paragraph" in result
        assert "[Content truncated" in result

    def test_truncation_adds_notice(self):
        """Test that truncation adds a notice."""
        markdown = "A" * 1000
        result = _truncate_markdown(markdown, 100)

        assert "[Content truncated due to size limit]" in result


class TestExtractSourceFromUrl:
    """Test URL source extraction functionality."""

    def test_extract_linkedin_source(self):
        """Test extracting LinkedIn as source."""
        assert _extract_source_from_url("https://linkedin.com/jobs/123") == "LinkedIn"
        assert (
            _extract_source_from_url("https://www.linkedin.com/jobs/123") == "LinkedIn"
        )

    def test_extract_indeed_source(self):
        """Test extracting Indeed as source."""
        assert _extract_source_from_url("https://indeed.com/job/123") == "Indeed"
        assert _extract_source_from_url("https://www.indeed.com/job/123") == "Indeed"

    def test_extract_glassdoor_source(self):
        """Test extracting Glassdoor as source."""
        assert _extract_source_from_url("https://glassdoor.com/job/123") == "Glassdoor"

    def test_extract_workday_source(self):
        """Test extracting Workday as source."""
        assert (
            _extract_source_from_url("https://myworkdayjobs.com/job/123") == "Workday"
        )
        assert _extract_source_from_url("https://workday.com/job/123") == "Workday"

    def test_extract_lever_source(self):
        """Test extracting Lever as source."""
        assert _extract_source_from_url("https://lever.co/job/123") == "Lever"

    def test_extract_greenhouse_source(self):
        """Test extracting Greenhouse as source."""
        assert _extract_source_from_url("https://greenhouse.io/job/123") == "Greenhouse"

    def test_unknown_url_returns_none(self):
        """Test that unknown URLs return None."""
        assert _extract_source_from_url("https://example.com/job/123") is None
        assert _extract_source_from_url("https://somecompany.com/careers") is None


class TestExtractWithLlm:
    """Test LLM extraction functionality with mocked responses."""

    def test_extract_with_llm_success(self):
        """Test successful extraction with valid LLM response."""
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(
                message=MagicMock(
                    content=json.dumps(
                        {
                            "title": "Senior Software Engineer",
                            "company": "Tech Corp",
                            "location": "San Francisco, CA",
                            "salary_min": 150000,
                            "salary_max": 200000,
                            "salary_currency": "USD",
                            "description": "Great opportunity",
                            "requirements_must_have": ["Python", "FastAPI"],
                            "requirements_nice_to_have": ["Docker"],
                            "skills": ["Python", "SQL"],
                        }
                    )
                )
            )
        ]

        with patch("app.services.extraction.completion") as mock_completion:
            mock_completion.return_value = mock_response

            result = extract_with_llm(
                content="Test job content",
                url="https://linkedin.com/jobs/123",
                api_key="test-key",
            )

            assert result.title == "Senior Software Engineer"
            assert result.company == "Tech Corp"
            assert result.location == "San Francisco, CA"
            assert result.salary_min == 150000
            assert result.salary_max == 200000
            assert result.source == "LinkedIn"  # Should be derived from URL

    def test_extract_with_llm_empty_response_raises_error(self):
        """Test that empty LLM response raises ExtractionInvalidResponseError."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content=None))]

        with patch("app.services.extraction.completion") as mock_completion:
            mock_completion.return_value = mock_response

            with pytest.raises(ExtractionInvalidResponseError, match="empty response"):
                extract_with_llm(
                    content="Test content",
                    url="https://example.com/job/123",
                    api_key="test-key",
                )

    def test_extract_with_llm_invalid_json_raises_error(self):
        """Test that invalid JSON response raises ExtractionInvalidResponseError after retry."""
        mock_response = MagicMock()
        # Return invalid JSON on all attempts
        mock_response.choices = [
            MagicMock(message=MagicMock(content="not valid json{{{"))
        ]

        with patch("app.services.extraction.completion") as mock_completion:
            mock_completion.return_value = mock_response

            with pytest.raises(ExtractionInvalidResponseError, match="Failed to parse"):
                extract_with_llm(
                    content="Test content",
                    url="https://example.com/job/123",
                    api_key="test-key",
                )

    def test_extract_with_llm_no_job_found_raises_error(self):
        """Test that when no job data is found, NoJobFoundError is raised."""
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(
                message=MagicMock(
                    content=json.dumps(
                        {
                            "title": None,
                            "company": None,
                            "description": None,
                            "location": None,
                            "requirements_must_have": [],
                            "requirements_nice_to_have": [],
                            "skills": [],
                        }
                    )
                )
            )
        ]

        with patch("app.services.extraction.completion") as mock_completion:
            mock_completion.return_value = mock_response

            with pytest.raises(NoJobFoundError, match="No job posting data"):
                extract_with_llm(
                    content="Login page content",
                    url="https://example.com/login",
                    api_key="test-key",
                )

    def test_extract_with_llm_timeout_raises_error(self):
        """Test that LLM timeout raises ExtractionTimeoutError."""
        with patch("app.services.extraction.completion") as mock_completion:
            mock_completion.side_effect = openai.APITimeoutError("timeout")

            with pytest.raises(ExtractionTimeoutError, match="timed out"):
                extract_with_llm(
                    content="Test content",
                    url="https://example.com/job/123",
                    api_key="test-key",
                    timeout=30,
                )

    def test_extract_with_llm_api_error_raises_error(self):
        """Test that LLM API error raises ExtractionInvalidResponseError."""
        # Create a mock request object for the APIError
        mock_request = MagicMock()

        with patch("app.services.extraction.completion") as mock_completion:
            mock_completion.side_effect = openai.APIError(
                "API error", request=mock_request, body=None
            )

            with pytest.raises(ExtractionInvalidResponseError, match="API error"):
                extract_with_llm(
                    content="Test content",
                    url="https://example.com/job/123",
                    api_key="test-key",
                )

    def test_extract_with_llm_custom_model(self):
        """Test extraction with custom model parameter."""
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(
                message=MagicMock(
                    content=json.dumps(
                        {
                            "title": "Developer",
                            "company": "Company",
                            "requirements_must_have": [],
                            "requirements_nice_to_have": [],
                            "skills": [],
                        }
                    )
                )
            )
        ]

        with patch("app.services.extraction.completion") as mock_completion:
            mock_completion.return_value = mock_response

            extract_with_llm(
                content="Test content",
                url="https://example.com/job/123",
                model="gpt-4",
                api_key="test-key",
            )

            # Verify custom model was used
            call_kwargs = mock_completion.call_args
            assert call_kwargs[1]["model"] == "gpt-4"

    def test_extract_with_llm_retry_on_invalid_json(self):
        """Test that extraction retries on invalid JSON response."""
        # First response: invalid JSON, second response: valid JSON
        invalid_response = MagicMock()
        invalid_response.choices = [
            MagicMock(message=MagicMock(content="invalid json{"))
        ]

        valid_response = MagicMock()
        valid_response.choices = [
            MagicMock(
                message=MagicMock(
                    content=json.dumps(
                        {
                            "title": "Engineer",
                            "company": "Corp",
                            "requirements_must_have": [],
                            "requirements_nice_to_have": [],
                            "skills": [],
                        }
                    )
                )
            )
        ]

        with patch("app.services.extraction.completion") as mock_completion:
            mock_completion.side_effect = [invalid_response, valid_response]

            result = extract_with_llm(
                content="Test content",
                url="https://example.com/job/123",
                api_key="test-key",
            )

            assert result.title == "Engineer"
            assert result.company == "Corp"
            # Should have called completion twice (initial + retry)
            assert mock_completion.call_count == 2


class TestExtractJobData:
    """Test the main extract_job_data async function."""

    @pytest.mark.asyncio
    async def test_extract_job_data_success(self):
        """Test successful job data extraction."""
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(
                message=MagicMock(
                    content=json.dumps(
                        {
                            "title": "Senior Software Engineer",
                            "company": "Tech Corp",
                            "location": "San Francisco, CA",
                            "salary_min": 150000,
                            "salary_max": 200000,
                            "requirements_must_have": [],
                            "requirements_nice_to_have": [],
                            "skills": [],
                        }
                    )
                )
            )
        ]

        with patch("app.services.extraction.completion") as mock_completion:
            mock_completion.return_value = mock_response

            result = await extract_job_data(
                html=SAMPLE_JOB_HTML,
                url="https://linkedin.com/jobs/123",
                api_key="test-key",
            )

            assert result.title == "Senior Software Engineer"
            assert result.company == "Tech Corp"
            assert result.source == "LinkedIn"

    @pytest.mark.asyncio
    async def test_extract_job_data_invalid_html_raises_error(self):
        """Test that invalid HTML raises ExtractionError."""
        with pytest.raises(ExtractionError, match="Failed to preprocess HTML"):
            await extract_job_data(
                html="   ",  # Whitespace-only fails preprocessing
                url="https://example.com/job/123",
                api_key="test-key",
            )

    @pytest.mark.asyncio
    async def test_extract_job_data_non_job_content_raises_error(self):
        """Test that non-job content raises NoJobFoundError."""
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(
                message=MagicMock(
                    content=json.dumps(
                        {
                            "title": None,
                            "company": None,
                            "requirements_must_have": [],
                            "requirements_nice_to_have": [],
                            "skills": [],
                        }
                    )
                )
            )
        ]

        with patch("app.services.extraction.completion") as mock_completion:
            mock_completion.return_value = mock_response

            with pytest.raises(NoJobFoundError):
                await extract_job_data(
                    html=NON_JOB_HTML,
                    url="https://example.com/login",
                    api_key="test-key",
                )

    @pytest.mark.asyncio
    async def test_extract_job_data_with_custom_timeout(self):
        """Test extraction with custom timeout parameter."""
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(
                message=MagicMock(
                    content=json.dumps(
                        {
                            "title": "Developer",
                            "company": "Company",
                            "requirements_must_have": [],
                            "requirements_nice_to_have": [],
                            "skills": [],
                        }
                    )
                )
            )
        ]

        with patch("app.services.extraction.completion") as mock_completion:
            mock_completion.return_value = mock_response

            await extract_job_data(
                html=SAMPLE_JOB_HTML,
                url="https://example.com/job/123",
                api_key="test-key",
                timeout=120,
            )

            # Verify timeout was passed
            call_kwargs = mock_completion.call_args
            assert call_kwargs[1]["timeout"] == 120


class TestJobLeadExtractionInputSchema:
    """Test the JobLeadExtractionInput Pydantic schema."""

    def test_valid_extraction_input(self):
        """Test creating valid extraction input."""
        data = JobLeadExtractionInput(
            title="Software Engineer",
            company="Tech Corp",
            location="Remote",
            salary_min=100000,
            salary_max=150000,
            salary_currency="USD",
            requirements_must_have=["Python"],
            requirements_nice_to_have=["Docker"],
            skills=["Python", "SQL"],
        )

        assert data.title == "Software Engineer"
        assert data.company == "Tech Corp"
        assert data.salary_min == 100000
        assert data.salary_max == 150000

    def test_optional_fields_default_to_none(self):
        """Test that optional fields default to None or empty list."""
        data = JobLeadExtractionInput()

        assert data.title is None
        assert data.company is None
        assert data.description is None
        assert data.location is None
        assert data.salary_min is None
        assert data.salary_max is None
        assert data.requirements_must_have == []
        assert data.requirements_nice_to_have == []
        assert data.skills == []

    def test_salary_max_must_be_gte_salary_min(self):
        """Test that salary_max >= salary_min validation."""
        # Valid: salary_max >= salary_min
        valid = JobLeadExtractionInput(salary_min=100000, salary_max=150000)
        assert valid.salary_max == 150000

        # Invalid: salary_max < salary_min
        with pytest.raises(Exception):  # Pydantic ValidationError
            JobLeadExtractionInput(salary_min=150000, salary_max=100000)

    def test_experience_range_validation(self):
        """Test that years_experience_max >= years_experience_min validation."""
        # Valid
        valid = JobLeadExtractionInput(years_experience_min=3, years_experience_max=5)
        assert valid.years_experience_max == 5

        # Invalid
        with pytest.raises(Exception):  # Pydantic ValidationError
            JobLeadExtractionInput(years_experience_min=5, years_experience_max=3)


class TestExtractionErrorTypes:
    """Test the different extraction error types."""

    def test_extraction_error_base(self):
        """Test base ExtractionError."""
        error = ExtractionError("Something went wrong", details={"url": "test.com"})

        assert str(error) == "Something went wrong"
        assert error.message == "Something went wrong"
        assert error.details == {"url": "test.com"}

    def test_extraction_timeout_error(self):
        """Test ExtractionTimeoutError."""
        error = ExtractionTimeoutError("Request timed out", details={"timeout": 60})

        assert isinstance(error, ExtractionError)
        assert "timed out" in str(error)

    def test_extraction_invalid_response_error(self):
        """Test ExtractionInvalidResponseError."""
        error = ExtractionInvalidResponseError(
            "Invalid JSON response", details={"raw_response": "bad json"}
        )

        assert isinstance(error, ExtractionError)
        assert "Invalid JSON" in str(error)

    def test_no_job_found_error(self):
        """Test NoJobFoundError."""
        error = NoJobFoundError(
            "No job data found", details={"content_preview": "Login page..."}
        )

        assert isinstance(error, ExtractionError)
        assert "No job data" in str(error)
