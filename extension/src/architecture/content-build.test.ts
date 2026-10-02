import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { build } from 'vite';
import { beforeAll, describe, expect, it, vi } from 'vitest';

describe('packaged content scripts', () => {
  let contentScript: string;
  let iframeScanner: string;

  beforeAll(async () => {
    // Share the actual Vite plugin output across both shipped entry points.
    const result = await build({ logLevel: 'silent', build: { write: false } });
    if (Array.isArray(result) || !('output' in result)) {
      throw new Error('Expected one extension build output');
    }
    const content = result.output.find(
      (chunk) => chunk.fileName === 'content/index.js'
    );
    const scanner = result.output.find(
      (chunk) => chunk.fileName === 'content/iframe-scanner.js'
    );
    if (
      !content ||
      content.type !== 'chunk' ||
      !scanner ||
      scanner.type !== 'chunk'
    )
      throw new Error('Missing built content script');
    contentScript = content.code;
    iframeScanner = scanner.code;
  });

  it('initializes bundled dependencies before registering the capture receiver', async () => {
    const addListener = vi.fn();
    const browser = {
      runtime: { id: 'synthetic-extension', onMessage: { addListener } },
      storage: { local: { get: async () => ({}) } },
    };
    const text = '<script>untrusted posting</script>';
    runInNewContext(contentScript, {
      chrome: browser,
      browser,
      // Browsers always expose `crypto`; the sandbox must model that, because the
      // content script uses it to generate the per-page iframe scan token.
      crypto: webcrypto,
      document: { readyState: 'loading', body: { innerText: text } },
      window: { addEventListener: vi.fn() },
      console,
    });
    expect(addListener).toHaveBeenCalledOnce();
    await expect(
      addListener.mock.calls[0][0]({ type: 'GET_TEXT' })
    ).resolves.toEqual({ text });
  });

  it('scans and handles autofill once when the built iframe scanner is injected twice', async () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const frameDocument = frame.contentDocument!;
    const frameWindow = frame.contentWindow!;
    const messages: MessageEvent[] = [];
    const receive = (event: MessageEvent) => messages.push(event);
    const nextTask = () =>
      new Promise<void>((resolve) => setTimeout(resolve, 0));
    const token = 'synthetic-page-token';
    const inject = () => {
      const script = frameDocument.createElement('script');
      script.dataset.tarnishedScanToken = token;
      script.textContent = iframeScanner;
      frameDocument.documentElement.appendChild(script);
    };
    window.addEventListener('message', receive);

    try {
      await vi.waitFor(() => expect(frameDocument.readyState).toBe('complete'));
      frameDocument.body.innerHTML =
        '<input autocomplete="given-name"><input type="email" autocomplete="email">';
      const inputs = frameDocument.querySelectorAll('input');
      // jsdom has no layout; keep the real scanner and filling logic, supplying only geometry.
      for (const input of inputs) {
        Object.defineProperties(input, {
          offsetWidth: { value: 160 },
          offsetHeight: { value: 24 },
        });
        input.getBoundingClientRect = () => new DOMRect(0, 0, 160, 24);
      }

      inject();
      await nextTask();
      expect(messages).toHaveLength(1);
      expect(messages[0].data).toMatchObject({
        type: 'TARNISHED_IFRAME_SCAN_RESULT',
        payload: { hasApplicationForm: true, fillableFieldCount: 2, token },
      });

      inject();
      await nextTask();
      expect(messages).toHaveLength(1);
      messages.length = 0;
      // jsdom postMessage omits source/origin, so provide the real parent identity on input.
      frameWindow.dispatchEvent(
        new MessageEvent('message', {
          source: frameWindow.parent,
          origin: frameWindow.parent.location.origin,
          data: {
            type: 'TARNISHED_IFRAME_AUTOFILL',
            payload: {
              token,
              profile: {
                first_name: 'Ada',
                last_name: null,
                email: 'ada@example.com',
                phone: null,
                city: null,
                country: null,
                linkedin_url: null,
              },
            },
          },
        })
      );
      // Flush the queued result messages before counting, including a possible duplicate.
      await nextTask();
      expect(Array.from(inputs, (input) => input.value)).toEqual([
        'Ada',
        'ada@example.com',
      ]);
      expect(messages.map((event) => event.data)).toEqual([
        {
          type: 'TARNISHED_IFRAME_AUTOFILL_RESULT',
          payload: { filledCount: 2 },
        },
      ]);
    } finally {
      window.removeEventListener('message', receive);
      frame.remove();
    }
  });
});
