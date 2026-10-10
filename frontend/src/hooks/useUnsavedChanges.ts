import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// Window popstate listeners run in registration order at the event target.
// Install before BrowserRouter so it cannot unmount a draft before confirmation.
const historyGuards = new Set<(event: PopStateEvent) => void>();
window.addEventListener(
  'popstate',
  (event) => {
    for (const guard of historyGuards) {
      guard(event);
      if (event.cancelBubble) break;
    }
  },
  true
);

/** Guard document exits, links and browser history while a draft or upload is pending. */
export function useUnsavedChanges(active: boolean) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!active) return;
    let index = window.history.state?.idx as number | undefined;
    let restoring = false;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const click = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest?.('a[href]');
      if (
        !link ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = link as HTMLAnchorElement;
      if (
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        anchor.href === window.location.href
      )
        return;
      if (
        !window.confirm(
          t('Leave without saving? Pending changes and uploads will be lost.')
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const pop = (event: PopStateEvent) => {
      if (restoring) {
        restoring = false;
        event.stopImmediatePropagation();
        return;
      }
      const next = event.state?.idx as number | undefined;
      if (
        index !== undefined &&
        next !== undefined &&
        next !== index &&
        !window.confirm(
          t('Leave without saving? Pending changes and uploads will be lost.')
        )
      ) {
        event.stopImmediatePropagation();
        restoring = true;
        window.history.go(index - next);
      } else {
        index = next;
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    historyGuards.add(pop);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
      historyGuards.delete(pop);
    };
  }, [active, t]);
}
