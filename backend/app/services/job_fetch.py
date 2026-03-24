"""Utilities for fetching remote job posting HTML."""

import logging

import httpx
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

HTTP_TIMEOUT_SECONDS = 30
HTTP_MAX_REDIRECTS = 5
HTTP_USER_AGENT = "Mozilla/5.0 (compatible; TarnishedBot/1.0)"


async def fetch_job_posting_html(url: str) -> str:
    """Fetch HTML content from a URL."""
    headers = {
        "User-Agent": HTTP_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }

    async with httpx.AsyncClient(
        timeout=HTTP_TIMEOUT_SECONDS,
        follow_redirects=True,
        max_redirects=HTTP_MAX_REDIRECTS,
    ) as client:
        try:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
        except httpx.TimeoutException:
            logger.warning("Timeout fetching URL: %s", url)
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="The job posting URL timed out. Please try again later.",
            )
        except httpx.TooManyRedirects:
            logger.warning("Too many redirects for URL: %s", url)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The URL has too many redirects. Please provide a direct job posting URL.",
            )
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            logger.warning("HTTP error %s for URL: %s", status_code, url)
            if status_code == 404:
                detail = "The job posting was not found (404). It may have been removed."
            elif status_code == 403:
                detail = "Access to the job posting was denied (403). The page may require authentication."
            elif status_code >= 500:
                detail = f"The job posting server returned an error ({status_code}). Please try again later."
            else:
                detail = f"Failed to fetch job posting (HTTP {status_code})."
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail,
            )
        except httpx.RequestError as exc:
            logger.error("Request error for URL %s: %s", url, exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to fetch the job posting URL: {str(exc)}",
            )

        content_type = response.headers.get("content-type", "")
        if (
            "text/html" not in content_type
            and "application/xhtml+xml" not in content_type
        ):
            logger.warning("Non-HTML content type for URL %s: %s", url, content_type)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The URL does not point to an HTML page. Please provide a job posting URL.",
            )

        return response.text
