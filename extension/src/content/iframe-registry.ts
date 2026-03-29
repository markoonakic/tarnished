type PostMessageTarget = {
  postMessage: (message: unknown, targetOrigin: string) => void;
};

export interface IframeScanResult {
  hasApplicationForm: boolean;
  fillableFieldCount: number;
  fields: Array<{
    fieldType: string;
    score: number;
    id: string;
    name: string;
    placeholder: string;
  }>;
  path?: string;
}

function isPostMessageTarget(source: MessageEventSource | null): boolean {
  return (
    typeof source === 'object' && source !== null && 'postMessage' in source
  );
}

function getIframeResultKey(origin: string, path?: string): string {
  return origin + (path || '');
}

function canReceiveAutofill(result: IframeScanResult): boolean {
  return result.hasApplicationForm || result.fillableFieldCount > 0;
}

function getTargetOrigin(origin: string): string | null {
  if (!origin || origin === 'null') {
    return null;
  }

  return origin;
}

type TrackedIframe = {
  origin: string;
  result: IframeScanResult;
  source: PostMessageTarget | null;
};

export function createIframeRegistry() {
  const trackedIframes = new Map<string, TrackedIframe>();

  return {
    recordScanResult(
      event: {
        origin: string;
        source: MessageEventSource | null;
      },
      payload: IframeScanResult
    ): void {
      trackedIframes.set(getIframeResultKey(event.origin, payload.path), {
        origin: event.origin,
        result: payload,
        source: isPostMessageTarget(event.source)
          ? (event.source as PostMessageTarget)
          : null,
      });
    },

    getResults(): IframeScanResult[] {
      return Array.from(trackedIframes.values(), ({ result }) => result);
    },

    sendAutofill<TProfile>(messageType: string, profile: TProfile): number {
      let sentCount = 0;

      for (const { origin, result, source } of trackedIframes.values()) {
        const targetOrigin = getTargetOrigin(origin);
        if (!source || !targetOrigin || !canReceiveAutofill(result)) {
          continue;
        }

        source.postMessage(
          {
            type: messageType,
            payload: { profile },
          },
          targetOrigin
        );
        sentCount++;
      }

      return sentCount;
    },
  };
}
