type PostMessageTarget = {
  postMessage: (message: unknown, targetOrigin: string) => void;
};

export interface IframeScanResult {
  hasApplicationForm: boolean;
  fillableFieldCount: number;
  /** Rejects unsolicited scan results; visible to the hosting page. */
  token?: string;
}

/** Checks frame membership before admitting scan results or sending profile data. */
type FrameSourceVerifier = (source: MessageEventSource | null) => boolean;

/** Resolves only frames that are still embedded at dispatch time. */
type FrameWindowResolver = (
  source: MessageEventSource | null
) => PostMessageTarget | null;

function canReceiveAutofill(result: IframeScanResult): boolean {
  return result.hasApplicationForm || result.fillableFieldCount > 0;
}

function getTargetOrigin(origin: string): string | null {
  if (!origin || origin === 'null') {
    return null;
  }

  // Only ordinary web origins may receive profile data.
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  return parsed.origin;
}

type TrackedIframe = {
  origin: string;
  result: IframeScanResult;
  source: MessageEventSource | null;
};

export function createIframeRegistry(options: {
  isTrustedFrame: FrameSourceVerifier;
  resolveFrameWindow: FrameWindowResolver;
  /** Expected token from this page's scanner injection. */
  scanToken: string;
}) {
  const trackedIframes = new Map<MessageEventSource, TrackedIframe>();

  return {
    recordScanResult(
      event: {
        origin: string;
        source: MessageEventSource | null;
      },
      payload: IframeScanResult
    ): void {
      // Untrusted frames are ignored entirely: they are neither aggregated nor
      // eligible to receive profile data later.
      if (!event.source || !options.isTrustedFrame(event.source)) {
        return;
      }

      // Embedding and a matching message type alone do not admit a scan result.
      if (payload.token !== options.scanToken) {
        return;
      }

      if (!options.resolveFrameWindow(event.source)) {
        return;
      }

      trackedIframes.set(event.source, {
        origin: event.origin,
        result: payload,
        source: event.source,
      });
    },

    getResults(): IframeScanResult[] {
      for (const source of trackedIframes.keys()) {
        if (!options.resolveFrameWindow(source)) trackedIframes.delete(source);
      }
      return Array.from(trackedIframes.values(), ({ result }) => result);
    },

    /** Returns delivery attempts, not successfully filled fields. */
    sendAutofill<TProfile>(messageType: string, profile: TProfile): number {
      let sentCount = 0;

      for (const { origin, result, source } of trackedIframes.values()) {
        const targetOrigin = getTargetOrigin(origin);
        if (!targetOrigin || !canReceiveAutofill(result)) {
          continue;
        }

        const postTarget = options.resolveFrameWindow(source);
        if (!postTarget) {
          continue;
        }

        postTarget.postMessage(
          {
            type: messageType,
            payload: { profile, token: options.scanToken },
          },
          targetOrigin
        );
        sentCount++;
      }

      return sentCount;
    },
  };
}
