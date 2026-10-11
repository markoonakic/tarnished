import { t } from './i18n';

// One guard covers all dirty forms and API writes, including concurrent requests.
const pending = new Set<symbol>();
let index: number | undefined;
let restoring = false;

export function registerExitGuard(): () => void {
  if (!pending.size) {
    index = window.history.state?.idx;
    restoring = false;
  }
  const token = Symbol();
  pending.add(token);
  return () => {
    pending.delete(token);
  };
}

export function beginApiWrite(method = 'GET'): () => void {
  return method.toUpperCase() === 'GET' ? () => {} : registerExitGuard();
}

const confirmLeave = () =>
  window.confirm(
    t('Leave without saving? Pending changes and uploads will be lost.')
  );

window.addEventListener('beforeunload', (event) => {
  if (!pending.size) return;
  event.preventDefault();
  event.returnValue = '';
});

document.addEventListener(
  'click',
  (event) => {
    if (!pending.size) return;
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
    if (!confirmLeave()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    } else {
      // A permitted client link can move history while a write remains pending.
      queueMicrotask(() => {
        index = window.history.state?.idx;
      });
    }
  },
  true
);

// Install before BrowserRouter so a canceled Back cannot unmount a draft.
window.addEventListener(
  'popstate',
  (event) => {
    const next = event.state?.idx as number | undefined;
    if (restoring) {
      event.stopImmediatePropagation();
      // Rapid Back/Forward can arrive before restoration reaches the draft.
      if (next === index) restoring = false;
      else if (index !== undefined && next !== undefined)
        window.history.go(index - next);
      return;
    }
    if (
      pending.size &&
      index !== undefined &&
      next !== undefined &&
      next !== index &&
      !confirmLeave()
    ) {
      event.stopImmediatePropagation();
      restoring = true;
      window.history.go(index - next);
    } else {
      index = next;
    }
  },
  true
);
