"""Bounded public-only fetching shared by application, lead creation and retry."""

import asyncio
import ipaddress
import socket
import zlib
from contextlib import AsyncExitStack

import httpx
from fastapi import HTTPException

HTTP_TIMEOUT_SECONDS = 30
HTTP_MAX_REDIRECTS = 5
HTTP_USER_AGENT = "Mozilla/5.0 (compatible; TarnishedBot/1.0)"
# Job HTML limits, independent of attachment/media upload limits.
HTTP_MAX_WIRE_BYTES = 2_000_000
HTTP_MAX_DECODED_BYTES = 2_000_000


def _public_address(value: str) -> str:
    ip = ipaddress.ip_address(value)
    checked = ip.ipv4_mapped if isinstance(ip, ipaddress.IPv6Address) else None
    checked = checked or ip
    if (
        not checked.is_global
        or checked.is_multicast
        or checked.is_reserved
        or "%" in value
    ):
        raise HTTPException(
            400, "The job posting URL must resolve only to public addresses."
        )
    return str(ip)


async def _destination(url: httpx.URL) -> list[str]:
    if url.scheme not in ("http", "https") or not url.host or url.userinfo:
        raise HTTPException(
            400, "Provide an HTTP(S) job posting URL without credentials."
        )
    host = url.raw_host.decode("ascii")
    if (
        "%" in host
        or host.rstrip(".").lower() == "localhost"
        or host.lower().endswith(".localhost")
    ):
        raise HTTPException(400, "The job posting URL must use a public hostname.")
    if url.port is not None and not 1 <= url.port <= 65535:
        raise HTTPException(400, "The job posting URL has an invalid port.")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        # This also resolves non-canonical IP-like names (decimal/octal/hex IPv4).
        answers = await asyncio.get_running_loop().getaddrinfo(
            host,
            url.port or (443 if url.scheme == "https" else 80),
            type=socket.SOCK_STREAM,
        )
        if not answers:
            raise HTTPException(
                400, "The job posting hostname has no public addresses."
            )
        addresses = [_public_address(str(answer[4][0])) for answer in answers]
        return list(dict.fromkeys(addresses))
    return [_public_address(host)]


async def _read_html(response: httpx.Response) -> str:
    content_type = response.headers.get("content-type", "")
    if content_type.split(";", 1)[0].strip().lower() not in (
        "text/html",
        "application/xhtml+xml",
    ):
        raise HTTPException(
            400,
            "The URL does not point to an HTML page. Please provide a job posting URL.",
        )
    length = response.headers.get("content-length")
    if length is not None:
        if not length.isascii() or not length.isdecimal():
            raise HTTPException(
                502, "The job posting server returned an invalid Content-Length."
            )
        # Avoid converting an attacker-controlled, arbitrarily long integer.
        if len(length) > 20 or int(length) > HTTP_MAX_WIRE_BYTES:
            raise HTTPException(400, "The job posting HTML is too large.")
    encoding = response.headers.get("content-encoding", "identity").strip().lower()
    if encoding not in ("identity", "gzip", "deflate"):
        raise HTTPException(
            502, "The job posting uses an unsupported content encoding."
        )
    wire = bytearray()
    # HTTPX aiter_bytes() decompresses before yielding and cannot bound expansion.
    # Cap raw bytes before buffering, then cap zlib output before allocating it.
    async for chunk in response.aiter_raw():
        if len(wire) + len(chunk) > HTTP_MAX_WIRE_BYTES:
            raise HTTPException(400, "The job posting HTML is too large.")
        wire.extend(chunk)
    if length is not None and len(wire) != int(length):
        raise HTTPException(
            502, "The job posting response was incomplete or malformed."
        )
    content = bytes(wire)
    if encoding != "identity":
        decoder = zlib.decompressobj(31 if encoding == "gzip" else 15)
        try:
            content = decoder.decompress(wire, HTTP_MAX_DECODED_BYTES + 1)
        except zlib.error:
            if encoding != "deflate":
                raise
            # Match HTTPX's compatibility with servers sending raw DEFLATE.
            decoder = zlib.decompressobj(-15)
            content = decoder.decompress(wire, HTTP_MAX_DECODED_BYTES + 1)
        if len(content) > HTTP_MAX_DECODED_BYTES:
            raise HTTPException(400, "The decoded job posting HTML is too large.")
        if not decoder.eof or decoder.unused_data:
            raise HTTPException(
                502, "The job posting compressed response was incomplete or malformed."
            )
    if len(content) > HTTP_MAX_DECODED_BYTES:
        raise HTTPException(400, "The decoded job posting HTML is too large.")
    # Preserve HTTPX charset handling, without asking it to decompress a second time.
    return httpx.Response(
        200, headers={"content-type": content_type}, content=content
    ).text


async def fetch_job_posting_html(url: str) -> str:
    """Fetch complete HTML, pinning each connection to a validated public address."""
    headers = {
        "User-Agent": HTTP_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
    }
    try:
        # A single deadline includes DNS, every redirect and the streamed body.
        loop = asyncio.get_running_loop()
        deadline = loop.time() + HTTP_TIMEOUT_SECONDS
        async with asyncio.timeout_at(deadline):
            current = httpx.URL(url)
            cookies = httpx.Cookies()
            for hop in range(HTTP_MAX_REDIRECTS + 1):
                addresses = await _destination(current)
                # Cookie domain/path/Secure matching must use the original URL,
                # not the numeric connection address.
                original = httpx.Request("GET", current, headers=headers)
                cookies.set_cookie_header(original)
                # Verify TLS against the original host. A client per hop isolates pools.
                async with (
                    httpx.AsyncClient(
                        timeout=HTTP_TIMEOUT_SECONDS,
                        follow_redirects=False,
                        trust_env=False,
                    ) as client,
                    AsyncExitStack() as stack,
                ):
                    response = None
                    for index, address in enumerate(addresses):
                        try:
                            response = await stack.enter_async_context(
                                client.stream(
                                    "GET",
                                    current.copy_with(host=address),
                                    headers=original.headers,
                                    extensions={
                                        "sni_hostname": current.raw_host.decode("ascii")
                                    },
                                    # Leave time for remaining validated addresses
                                    # if one connection stalls. Never resolve again.
                                    timeout=httpx.Timeout(
                                        HTTP_TIMEOUT_SECONDS,
                                        connect=max(0, deadline - loop.time())
                                        / (len(addresses) - index),
                                    ),
                                )
                            )
                        except (httpx.ConnectError, httpx.ConnectTimeout):
                            if index == len(addresses) - 1:
                                raise
                        else:
                            break
                    assert response is not None  # _destination rejects empty DNS.
                    cookies.extract_cookies(
                        httpx.Response(
                            response.status_code,
                            headers=response.headers,
                            request=original,
                        )
                    )
                    if response.has_redirect_location:
                        if hop == HTTP_MAX_REDIRECTS:
                            raise HTTPException(
                                400,
                                "The URL has too many redirects. Please provide a direct job posting URL.",
                            )
                        # Resolve against the original hostname, never the pinned IP.
                        following = current.join(response.headers["location"])
                        if (current.scheme, current.host, current.port) != (
                            following.scheme,
                            following.host,
                            following.port,
                        ):
                            cookies.clear()
                        current = following
                        continue
                    response.raise_for_status()
                    return await _read_html(response)
    except (TimeoutError, httpx.TimeoutException):
        raise HTTPException(
            504, "The job posting URL timed out. Please try again later."
        )
    except (httpx.InvalidURL, UnicodeError):
        raise HTTPException(400, "The job posting URL is invalid.")
    except socket.gaierror:
        raise HTTPException(502, "The job posting hostname could not be resolved.")
    except httpx.HTTPStatusError as exc:
        code = exc.response.status_code
        if code == 404:
            detail = "The job posting was not found (404). It may have been removed."
        elif code == 403:
            detail = "Access to the job posting was denied (403). The page may require authentication."
        elif code >= 500:
            detail = f"The job posting server returned an error ({code}). Please try again later."
        else:
            detail = f"Failed to fetch job posting (HTTP {code})."
        raise HTTPException(502, detail)
    except zlib.error:
        raise HTTPException(
            502, "The job posting response has invalid compressed content."
        )
    except httpx.RequestError:
        # Do not expose upstream URLs, credentials, headers or transport diagnostics.
        raise HTTPException(
            502,
            "Failed to fetch the job posting URL. Please check the URL and try again.",
        )
    raise HTTPException(400, "The URL has too many redirects.")
