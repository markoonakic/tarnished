"""Deterministic DNS/transport evidence; no deployed or live-network claims."""

import asyncio
import socket
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

from app.services import job_fetch


class Body(httpx.AsyncByteStream):
    def __init__(self, *chunks):
        self.chunks = chunks
        self.closed = False

    async def __aiter__(self):
        for chunk in self.chunks:
            yield chunk

    async def aclose(self):
        self.closed = True


@pytest.fixture
async def remote(monkeypatch):
    requests = []
    answers = ["93.184.216.34"]
    responses = []

    async def resolve(host, port, **kwargs):
        return [
            (
                socket.AF_INET6 if ":" in ip else socket.AF_INET,
                socket.SOCK_STREAM,
                6,
                "",
                (ip, port),
            )
            for ip in answers
        ]

    async def handle(self, request):
        requests.append(request)
        if responses:
            return responses.pop(0)
        return httpx.Response(
            200,
            headers={"content-type": "text/html"},
            stream=Body(b"<p>Public job</p>"),
        )

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolve)
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", handle)
    return requests, answers, responses


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/job",
        "http://10.0.0.1/",
        "http://[::ffff:127.0.0.1]/",
        "http://169.254.169.254/latest",
    ],
)
async def test_fetch_rejects_private_literal(remote, url):
    with pytest.raises(HTTPException) as exc:
        await job_fetch.fetch_job_posting_html(url)
    assert exc.value.status_code == 400
    assert remote[0] == []


async def test_fetch_rejects_mixed_dns_answers(remote):
    remote[1].append("127.0.0.1")
    with pytest.raises(HTTPException) as exc:
        await job_fetch.fetch_job_posting_html("https://jobs.example/job")
    assert exc.value.status_code == 400
    assert remote[0] == []


@pytest.mark.parametrize(
    "address",
    [
        "0.0.0.0",
        "127.1.2.3",
        "10.1.2.3",
        "172.16.0.1",
        "192.168.1.2",
        "169.254.169.254",
        "100.64.0.1",
        "192.0.2.1",
        "224.0.0.1",
        "240.0.0.1",
        "::",
        "::1",
        "fc00::1",
        "fe80::1",
        "ff02::1",
        "2001:db8::1",
        "::ffff:10.0.0.1",
        "::ffff:169.254.169.254",
    ],
)
async def test_fetch_rejects_nonpublic_dns(remote, address):
    remote[1][:] = [address]
    with pytest.raises(HTTPException) as exc:
        await job_fetch.fetch_job_posting_html("https://jobs.example/")
    assert exc.value.status_code == 400
    assert not remote[0]


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://jobs.example/file",
        "https:///missing-host",
        "https://user:password@jobs.example/",
        "http://localhost/",
        "http://x.localhost/",
        "http://[fe80::1%25eth0]/",
        "http://jobs.example:99999/",
        "http://jobs.example:0/",
    ],
)
async def test_fetch_rejects_invalid_urls(remote, url):
    with pytest.raises(HTTPException) as exc:
        await job_fetch.fetch_job_posting_html(url)
    assert exc.value.status_code == 400
    assert not remote[0]


@pytest.mark.parametrize("host", ["2130706433", "0177.0.0.1", "0x7f000001", "127.1"])
async def test_fetch_validates_ip_like_resolution(remote, host):
    remote[1][:] = ["127.0.0.1"]
    with pytest.raises(HTTPException) as exc:
        await job_fetch.fetch_job_posting_html(f"http://{host}/")
    assert exc.value.status_code == 400
    assert not remote[0]


@pytest.mark.parametrize("scheme", ["http", "https"])
@pytest.mark.parametrize(
    "address", ["93.184.216.34", "2606:4700:4700::1111", "::ffff:93.184.216.34"]
)
async def test_fetch_public_html_pins_host(remote, scheme, address):
    remote[1][:] = [address]
    assert (
        await job_fetch.fetch_job_posting_html(
            f"{scheme}://jobs.example:8443/job?q=one"
        )
        == "<p>Public job</p>"
    )
    request = remote[0][0]
    import ipaddress

    assert ipaddress.ip_address(request.url.host) == ipaddress.ip_address(address)
    assert request.url.port == 8443
    assert request.url.raw_path == b"/job?q=one"
    assert request.headers["host"] == "jobs.example:8443"
    assert request.extensions["sni_hostname"] == "jobs.example"


@pytest.mark.parametrize(
    "location",
    [
        "http://127.0.0.1/",
        "//169.254.169.254/",
        "https://user:password@jobs.example/",
        "file:///etc/passwd",
    ],
)
async def test_fetch_rejects_unsafe_redirect(remote, location):
    body = Body(b"ignored redirect content")
    remote[2].append(httpx.Response(302, headers={"location": location}, stream=body))
    with pytest.raises(HTTPException) as exc:
        await job_fetch.fetch_job_posting_html("https://jobs.example/jobs/1")
    assert exc.value.status_code == 400
    assert len(remote[0]) == 1
    assert body.closed


async def test_fetch_relative_and_cross_origin_redirects_do_not_forward_state(remote):
    remote[2].extend(
        [
            httpx.Response(
                302,
                headers={"location": "../next?q=ok", "set-cookie": "secret=one"},
                stream=Body(),
            ),
            httpx.Response(
                307, headers={"location": "//other.example/final"}, stream=Body()
            ),
        ]
    )
    assert (
        await job_fetch.fetch_job_posting_html("https://jobs.example/jobs/1")
        == "<p>Public job</p>"
    )
    assert [r.url.raw_path for r in remote[0]] == [b"/jobs/1", b"/next?q=ok", b"/final"]
    assert [r.headers["host"] for r in remote[0]] == [
        "jobs.example",
        "jobs.example",
        "other.example",
    ]
    for request in remote[0]:
        assert not {"cookie", "authorization", "proxy-authorization", "referer"} & set(
            request.headers
        )


async def test_fetch_same_origin_redirect_retains_required_cookie(remote, monkeypatch):
    original = httpx.AsyncHTTPTransport.handle_async_request

    async def require_cookie(self, request):
        if request.url.path == "/job" and request.headers.get("cookie") != "visit=1":
            return httpx.Response(403, stream=Body())
        return await original(self, request)

    monkeypatch.setattr(
        httpx.AsyncHTTPTransport, "handle_async_request", require_cookie
    )
    for _ in range(2):
        remote[2].append(
            httpx.Response(
                302,
                headers={"location": "/job", "set-cookie": "visit=1; Path=/; Secure"},
                stream=Body(),
            )
        )
        assert (
            await job_fetch.fetch_job_posting_html("https://jobs.example/start")
            == "<p>Public job</p>"
        )
    assert [r.headers.get("cookie") for r in remote[0]] == [
        None,
        "visit=1",
        None,
        "visit=1",
    ]


@pytest.mark.parametrize(
    ("cookie", "location", "expected"),
    [
        ("visit=1; Domain=jobs.example; Path=/", "/job", "visit=1"),
        ("visit=1; Domain=other.example; Path=/", "/job", None),
        ("visit=1; Path=/private", "/job", None),
        ("visit=1; Path=/private", "/private/job", "visit=1"),
        ("visit=1; Path=/; Max-Age=0", "/job", None),
        ("visit=1; Path=/; Secure", "http://jobs.example/job", None),
        ("visit=1; Domain=jobs.example; Path=/", "https://sub.jobs.example/job", None),
        ("visit=1; Path=/", "https://jobs.example:8443/job", None),
    ],
)
async def test_fetch_redirect_cookie_scope(remote, cookie, location, expected):
    remote[2].append(
        httpx.Response(
            302, headers={"location": location, "set-cookie": cookie}, stream=Body()
        )
    )
    assert (
        await job_fetch.fetch_job_posting_html("https://jobs.example/start")
        == "<p>Public job</p>"
    )
    assert remote[0][1].headers.get("cookie") == expected


async def test_fetch_secure_cookie_is_not_sent_over_http(remote):
    remote[2].append(
        httpx.Response(
            302,
            headers={"location": "/job", "set-cookie": "visit=1; Path=/; Secure"},
            stream=Body(),
        )
    )
    await job_fetch.fetch_job_posting_html("http://jobs.example/start")
    assert "cookie" not in remote[0][1].headers


async def test_fetch_bounds_redirect_loops(remote):
    remote[2].extend(
        httpx.Response(302, headers={"location": "/loop"}, stream=Body())
        for _ in range(6)
    )
    with pytest.raises(HTTPException, match="redirects") as exc:
        await job_fetch.fetch_job_posting_html("https://jobs.example/loop")
    assert exc.value.status_code == 400
    assert len(remote[0]) == 6


@pytest.mark.parametrize("length", [None, "1", "1000"])
async def test_fetch_bounds_raw_bytes_without_trusting_content_length(
    remote, monkeypatch, length
):
    monkeypatch.setattr(job_fetch, "HTTP_MAX_WIRE_BYTES", 10)
    headers = {"content-type": "text/html"}
    if length is not None:
        headers["content-length"] = length
    body = Body(b"12345", b"67890", b"excess")
    remote[2].append(httpx.Response(200, headers=headers, stream=body))
    with pytest.raises(HTTPException, match="too large"):
        await job_fetch.fetch_job_posting_html("https://jobs.example/")
    assert body.closed


@pytest.mark.parametrize("encoding", ["gzip", "deflate", "identity"])
async def test_fetch_encoding_and_charset(remote, encoding):
    import gzip
    import zlib

    data = "<p>développeur</p>".encode("iso-8859-1")
    wire = (
        gzip.compress(data)
        if encoding == "gzip"
        else zlib.compress(data)
        if encoding == "deflate"
        else data
    )
    body = Body(*(wire[i : i + 1] for i in range(len(wire))))
    remote[2].append(
        httpx.Response(
            200,
            headers={
                "content-type": "Text/HTML; charset=iso-8859-1",
                "content-encoding": encoding,
                "content-length": str(len(wire)),
            },
            stream=body,
        )
    )
    assert (
        await job_fetch.fetch_job_posting_html("https://jobs.example/")
        == "<p>développeur</p>"
    )
    assert body.closed


@pytest.mark.parametrize("encoding", ["gzip", "deflate"])
async def test_fetch_bounds_compressed_expansion(remote, monkeypatch, encoding):
    import gzip
    import zlib

    monkeypatch.setattr(job_fetch, "HTTP_MAX_DECODED_BYTES", 100)
    wire = (
        gzip.compress(b"a" * 100_000)
        if encoding == "gzip"
        else zlib.compress(b"a" * 100_000)
    )
    remote[2].append(
        httpx.Response(
            200,
            headers={"content-type": "text/html", "content-encoding": encoding},
            stream=Body(wire),
        )
    )
    with pytest.raises(HTTPException, match="too large"):
        await job_fetch.fetch_job_posting_html("https://jobs.example/")


@pytest.mark.parametrize(
    ("headers", "wire", "message"),
    [
        ({"content-length": "10"}, b"short", "incomplete"),
        ({"content-length": "2"}, b"longer", "incomplete"),
        ({"content-length": "bad"}, b"", "Content-Length"),
        ({"content-encoding": "gzip"}, b"not gzip", "compressed"),
        ({"content-encoding": "br"}, b"", "unsupported"),
        ({"content-type": "image/png"}, b"", "HTML"),
    ],
)
async def test_fetch_rejects_malformed_responses(remote, headers, wire, message):
    remote[2].append(
        httpx.Response(
            200, headers={"content-type": "text/html", **headers}, stream=Body(wire)
        )
    )
    with pytest.raises(HTTPException, match=message):
        await job_fetch.fetch_job_posting_html("https://jobs.example/")


@pytest.mark.parametrize("suffix", ["truncated", "trailing"])
async def test_fetch_does_not_accept_partial_compressed_data(remote, suffix):
    import gzip

    wire = gzip.compress(b"<p>Job</p>")
    wire = wire[:-4] if suffix == "truncated" else wire + b"trailing"
    remote[2].append(
        httpx.Response(
            200,
            headers={"content-type": "text/html", "content-encoding": "gzip"},
            stream=Body(wire),
        )
    )
    with pytest.raises(HTTPException) as exc:
        await job_fetch.fetch_job_posting_html("https://jobs.example/")
    assert exc.value.status_code == 502


async def test_fetch_deadline_includes_slow_body(remote, monkeypatch):
    class SlowBody(Body):
        async def __aiter__(self):
            while True:
                await asyncio.sleep(0.01)
                yield b"a"

    monkeypatch.setattr(job_fetch, "HTTP_TIMEOUT_SECONDS", 0.05)
    body = SlowBody()
    remote[2].append(
        httpx.Response(200, headers={"content-type": "text/html"}, stream=body)
    )
    with pytest.raises(HTTPException) as exc:
        await asyncio.wait_for(
            job_fetch.fetch_job_posting_html("https://jobs.example/"), 1
        )
    assert exc.value.status_code == 504
    assert body.closed


async def test_fetch_deadline_includes_dns(remote, monkeypatch):
    async def slow(*args, **kwargs):
        await asyncio.sleep(1)

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", slow)
    monkeypatch.setattr(job_fetch, "HTTP_TIMEOUT_SECONDS", 0.01)
    with pytest.raises(HTTPException) as exc:
        await asyncio.wait_for(
            job_fetch.fetch_job_posting_html("https://jobs.example/"), 0.5
        )
    assert exc.value.status_code == 504
    assert not remote[0]


@pytest.mark.parametrize("code", [403, 404, 500])
async def test_fetch_preserves_meaningful_status_errors(remote, code):
    remote[2].append(httpx.Response(code, stream=Body()))
    with pytest.raises(HTTPException, match=str(code)) as exc:
        await job_fetch.fetch_job_posting_html("https://jobs.example/")
    assert exc.value.status_code == 502


@pytest.fixture
async def socket_boundary(monkeypatch):
    """Keep HTTPX/httpcore/AnyIO routing real; replace only socket IO and TLS wrap."""
    import ssl

    import anyio
    from anyio._backends._asyncio import AsyncIOBackend
    from anyio.streams.tls import TLSStream

    dns_calls = []
    sockets = []
    tls_hosts = []
    replies = []
    fail_tls = []

    async def resolve(host, port, **kwargs):
        dns_calls.append(host)
        # A second DNS lookup would rebind this name to loopback.
        address = "93.184.216.34" if len(dns_calls) == 1 else "127.0.0.1"
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))]

    class Socket:
        def __init__(self, host, port):
            self.host, self.port = host, port
            self.sent = bytearray()
            self.reply = (
                replies.pop(0)
                if replies
                else b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 3\r\n\r\njob"
            )
            self.closed = False

        async def receive(self, max_bytes=65536):
            await asyncio.sleep(0)
            if not self.reply:
                raise anyio.EndOfStream
            result, self.reply = self.reply[:max_bytes], self.reply[max_bytes:]
            return result

        async def send(self, item):
            self.sent.extend(item)

        async def aclose(self):
            self.closed = True

        def extra(self, attribute, default=None):
            return default

    async def connect(cls, host, port, local_address=None):
        connection = Socket(host, port)
        sockets.append(connection)
        return connection

    async def wrap(cls, stream, *, ssl_context, hostname, server_side, **kwargs):
        assert ssl_context.verify_mode == ssl.CERT_REQUIRED
        assert ssl_context.check_hostname is True
        assert server_side is False
        tls_hosts.append(hostname)
        if fail_tls:
            raise ssl.SSLCertVerificationError("synthetic certificate mismatch")
        return stream

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolve)
    monkeypatch.setattr(AsyncIOBackend, "connect_tcp", classmethod(connect))
    monkeypatch.setattr(TLSStream, "wrap", classmethod(wrap))
    for variable in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        monkeypatch.setenv(variable, "http://unsafe-proxy.example:3128")
    monkeypatch.setenv("NO_PROXY", "")
    return sockets, dns_calls, tls_hosts, replies, fail_tls


@pytest.mark.parametrize("scheme", ["http", "https"])
async def test_fetch_actual_transport_pins_socket_and_preserves_tls_identity(
    socket_boundary, scheme
):
    sockets, dns, tls, _, _ = socket_boundary
    assert (
        await job_fetch.fetch_job_posting_html(
            f"{scheme}://jobs.example:8443/open?id=1"
        )
        == "job"
    )
    assert dns == ["jobs.example"]  # No second hostname resolution or proxy lookup.
    assert [(s.host, s.port) for s in sockets] == [("93.184.216.34", 8443)]
    assert tls == (["jobs.example"] if scheme == "https" else [])
    assert b"Host: jobs.example:8443\r\n" in sockets[0].sent
    assert sockets[0].sent.startswith(b"GET /open?id=1 HTTP/1.1\r\n")
    assert sockets[0].closed


@pytest.mark.parametrize("failure", ["unreachable", "timeout"])
async def test_fetch_actual_transport_falls_back_to_validated_address(
    socket_boundary, monkeypatch, failure
):
    from anyio._backends._asyncio import AsyncIOBackend

    sockets, dns, tls, _, _ = socket_boundary
    attempts = []
    original = AsyncIOBackend.connect_tcp

    async def resolve(host, port, **kwargs):
        dns.append(host)
        assert len(dns) == 1, "Fallback must not re-resolve the hostname"
        return [
            (
                socket.AF_INET6,
                socket.SOCK_STREAM,
                6,
                "",
                ("2606:4700:4700::1111", port),
            ),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port)),
        ]

    async def connect(cls, host, port, local_address=None):
        attempts.append(host)
        if ":" in host:
            if failure == "timeout":
                await asyncio.sleep(10)
            raise OSError("synthetic unreachable IPv6")
        return await original(host, port, local_address=local_address)

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolve)
    monkeypatch.setattr(AsyncIOBackend, "connect_tcp", classmethod(connect))
    monkeypatch.setattr(job_fetch, "HTTP_TIMEOUT_SECONDS", 1)
    assert (
        await job_fetch.fetch_job_posting_html("https://jobs.example:8443/job") == "job"
    )
    assert attempts == ["2606:4700:4700::1111", "93.184.216.34"]
    assert dns == ["jobs.example"]
    assert tls == ["jobs.example"]
    assert len(sockets) == 1 and sockets[0].closed
    assert b"Host: jobs.example:8443\r\n" in sockets[0].sent


@pytest.mark.parametrize("failure", [403, 500, "read"])
async def test_fetch_address_fallback_does_not_retry_http_responses(
    remote, monkeypatch, failure
):
    remote[1].append("1.1.1.1")

    class FailedBody(Body):
        async def __aiter__(self):
            yield b"partial"
            raise httpx.ReadError("synthetic read failure")

    if failure == "read":
        remote[2].append(
            httpx.Response(
                200, headers={"content-type": "text/html"}, stream=FailedBody()
            )
        )
    else:
        remote[2].append(httpx.Response(failure, stream=Body()))
    with pytest.raises(HTTPException) as exc:
        await job_fetch.fetch_job_posting_html("https://jobs.example/job")
    assert exc.value.status_code == 502
    assert len(remote[0]) == 1


async def test_fetch_address_fallback_stays_within_total_deadline(remote, monkeypatch):
    attempts = []
    cancelled = []
    deadlines = []
    remote[1].append("1.1.1.1")
    loop = asyncio.get_running_loop()
    now = 100.0
    scope = asyncio.timeout(None)

    def timeout_at(when):
        deadlines.append(when)
        return scope

    # Control only the fetcher's clock/deadline, not the event loop or HTTPX.
    # Client preparation and scheduler load must not decide whether fallback runs.
    monkeypatch.setattr(
        job_fetch,
        "asyncio",
        SimpleNamespace(
            get_running_loop=lambda: SimpleNamespace(
                time=lambda: now, getaddrinfo=loop.getaddrinfo
            ),
            timeout_at=timeout_at,
        ),
    )

    async def fail(self, request):
        nonlocal now
        attempts.append(request.url.host)
        assert deadlines == [pytest.approx(100.1)]
        connect_budget = request.extensions["timeout"]["connect"]
        if len(attempts) == 1:
            assert connect_budget == pytest.approx(0.05)
            now += 0.06
            raise httpx.ConnectError("synthetic failure")
        assert connect_budget == pytest.approx(0.04)  # Not a fresh 0.1s budget.
        # Expire the same real asyncio scope while fallback is suspended.
        scope.reschedule(loop.time())
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.append(request.url.host)
            raise

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", fail)
    monkeypatch.setattr(job_fetch, "HTTP_TIMEOUT_SECONDS", 0.1)
    with pytest.raises(HTTPException) as exc:
        await asyncio.wait_for(
            job_fetch.fetch_job_posting_html("https://jobs.example/"), 5
        )
    assert exc.value.status_code == 504
    assert attempts == ["93.184.216.34", "1.1.1.1"]
    assert cancelled == ["1.1.1.1"]
    assert scope.expired()


async def test_fetch_actual_transport_certificate_failure_is_not_bypassed(
    socket_boundary,
):
    sockets, dns, tls, _, fail_tls = socket_boundary
    fail_tls.append(True)
    with pytest.raises(HTTPException) as exc:
        await job_fetch.fetch_job_posting_html("https://jobs.example/")
    assert exc.value.status_code == 502
    assert tls == ["jobs.example"]
    assert sockets[0].closed
    assert not sockets[0].sent


async def test_fetch_revalidates_dns_on_relative_redirect(socket_boundary):
    sockets, dns, tls, replies, _ = socket_boundary
    replies.append(
        b"HTTP/1.1 302 Found\r\nLocation: /next\r\nContent-Length: 0\r\n\r\n"
    )
    with pytest.raises(HTTPException) as exc:
        await job_fetch.fetch_job_posting_html("https://jobs.example/first")
    assert exc.value.status_code == 400
    assert dns == ["jobs.example", "jobs.example"]
    assert len(sockets) == 1
    assert sockets[0].closed


@pytest.mark.parametrize(
    ("framing", "data", "limit", "expected"),
    [
        (b"Transfer-Encoding: chunked", b"3\r\njob\r\n0\r\n\r\n", 10, "job"),
        (b"Transfer-Encoding: chunked", b"3\r\njob\r\n4\r\nmore\r\n0\r\n\r\n", 5, 400),
        (b"Content-Length: 10", b"short", 20, 502),
    ],
)
async def test_fetch_actual_http_framing(
    socket_boundary, monkeypatch, framing, data, limit, expected
):
    sockets, _, _, replies, _ = socket_boundary
    monkeypatch.setattr(job_fetch, "HTTP_MAX_WIRE_BYTES", limit)
    replies.append(
        b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n" + framing + b"\r\n\r\n" + data
    )
    if isinstance(expected, int):
        with pytest.raises(HTTPException) as exc:
            await job_fetch.fetch_job_posting_html("http://jobs.example/")
        assert exc.value.status_code == expected
    else:
        assert (
            await job_fetch.fetch_job_posting_html("http://jobs.example/") == expected
        )
    assert sockets[0].closed


async def test_fetch_accepts_bounded_raw_deflate(remote):
    import zlib

    encoder = zlib.compressobj(wbits=-15)
    wire = encoder.compress(b"<p>Public job</p>") + encoder.flush()
    remote[2].append(
        httpx.Response(
            200,
            headers={"content-type": "text/html", "content-encoding": "deflate"},
            stream=Body(wire[:1], wire[1:]),
        )
    )
    assert (
        await job_fetch.fetch_job_posting_html("https://jobs.example/")
        == "<p>Public job</p>"
    )


async def test_fetch_bounds_raw_deflate_expansion(remote, monkeypatch):
    import zlib

    monkeypatch.setattr(job_fetch, "HTTP_MAX_DECODED_BYTES", 100)
    encoder = zlib.compressobj(wbits=-15)
    wire = encoder.compress(b"a" * 100_000) + encoder.flush()
    remote[2].append(
        httpx.Response(
            200,
            headers={"content-type": "text/html", "content-encoding": "deflate"},
            stream=Body(wire),
        )
    )
    with pytest.raises(HTTPException, match="too large"):
        await job_fetch.fetch_job_posting_html("https://jobs.example/")


async def test_fetch_total_deadline_does_not_reset_on_redirect(remote, monkeypatch):
    original = httpx.AsyncHTTPTransport.handle_async_request

    async def delayed(self, request):
        await asyncio.sleep(0.04)
        return await original(self, request)

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", delayed)
    monkeypatch.setattr(job_fetch, "HTTP_TIMEOUT_SECONDS", 0.1)
    remote[2].extend(
        httpx.Response(302, headers={"location": "/next"}, stream=Body())
        for _ in range(5)
    )
    with pytest.raises(HTTPException) as exc:
        await asyncio.wait_for(
            job_fetch.fetch_job_posting_html("https://jobs.example/"), 1
        )
    assert exc.value.status_code == 504
    assert len(remote[0]) < 5


@pytest.mark.parametrize(
    "failure",
    [
        socket.gaierror("synthetic DNS failure"),
        httpx.ConnectError("secret internal transport diagnostics"),
    ],
)
async def test_fetch_failures_are_meaningful_and_sanitized(
    remote, monkeypatch, failure
):
    async def fail(*args, **kwargs):
        raise failure

    if isinstance(failure, socket.gaierror):
        monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", fail)
    else:
        monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", fail)
    with pytest.raises(HTTPException) as exc:
        await job_fetch.fetch_job_posting_html("https://jobs.example/")
    assert exc.value.status_code == 502
    assert "secret" not in exc.value.detail


async def test_fetch_empty_dns_answer_is_rejected(remote):
    remote[1].clear()
    with pytest.raises(HTTPException) as exc:
        await job_fetch.fetch_job_posting_html("https://jobs.example/")
    assert exc.value.status_code == 400
    assert not remote[0]


@pytest.mark.parametrize(
    "url",
    [
        "http://93.184.216.34/job",
        "https://93.184.216.34/job",
        "http://[2606:4700:4700::1111]/job",
    ],
)
async def test_fetch_public_literals_do_not_require_dns(remote, monkeypatch, url):
    async def no_dns(*args, **kwargs):
        pytest.fail("A canonical IP literal must not be resolved")

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", no_dns)
    assert await job_fetch.fetch_job_posting_html(url) == "<p>Public job</p>"
    assert remote[0][0].headers["host"] == httpx.URL(url).netloc.decode("ascii")


async def test_fetch_cross_origin_same_ip_starts_new_verified_tls_connection(
    socket_boundary, monkeypatch
):
    sockets, dns, tls, replies, _ = socket_boundary

    async def resolve(host, port, **kwargs):
        dns.append(host)
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port))]

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolve)
    replies.append(
        b"HTTP/1.1 302 Found\r\nLocation: https://other.example/final\r\nSet-Cookie: secret=one\r\nContent-Length: 0\r\n\r\n"
    )
    assert await job_fetch.fetch_job_posting_html("https://jobs.example/first") == "job"
    assert dns == ["jobs.example", "other.example"]
    assert tls == ["jobs.example", "other.example"]
    assert len(sockets) == 2
    assert all(s.host == "93.184.216.34" and s.closed for s in sockets)
    assert b"Host: other.example\r\n" in sockets[1].sent
    assert b"Cookie:" not in sockets[1].sent
    assert b"Authorization:" not in sockets[1].sent


async def test_fetch_invalid_dns_hostname_is_a_client_error(remote, monkeypatch):
    async def invalid(*args, **kwargs):
        raise UnicodeError("label too long")

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", invalid)
    with pytest.raises(HTTPException) as exc:
        await job_fetch.fetch_job_posting_html("https://" + "a" * 64 + ".example/")
    assert exc.value.status_code == 400
    assert not remote[0]
