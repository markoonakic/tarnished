import { useTranslation } from 'react-i18next';
import { useLayoutEffect, useRef, type ReactNode } from 'react';

// Dropdowns stay inside the dialog (no portals). The browser owns focus,
// background inertness, nested-dialog Escape ordering and focus restoration.
export default function Modal({
  children,
  onClose,
  labelledBy,
  label,
  busy = false,
}: {
  children: ReactNode;
  onClose: () => void;
  labelledBy?: string;
  label?: string;
  busy?: boolean;
}) {
  useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    // Do not open help by giving it the dialog's automatic initial focus.
    dialog
      .querySelector<HTMLElement>(
        '[autofocus], button:not([data-help-tip]):not(:disabled), input:not(:disabled)'
      )
      ?.focus();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-label={label}
      aria-modal="true"
      className="bg-bg0/80 fixed inset-0 m-0 h-full max-h-none w-full max-w-none border-0 p-0 text-inherit backdrop:bg-transparent open:flex open:items-center open:justify-center"
      onCancel={(event) => {
        event.preventDefault();
        // A nested dialog's cancel must not close its parent.
        event.stopPropagation();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
