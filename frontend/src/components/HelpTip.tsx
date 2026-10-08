import { useTranslation } from 'react-i18next';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export default function HelpTip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  useTranslation();
  const id = useId();
  const wrapper = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = !dismissed && (hovered || focused || clicked);

  useLayoutEffect(() => {
    const node = tooltip.current;
    if (!node) return;
    const place = () => {
      const margin = 8;
      node.style.left = '0px';
      const rect = node.getBoundingClientRect();
      let shift = 0;
      if (rect.right > window.innerWidth - margin)
        shift = window.innerWidth - margin - rect.right;
      if (rect.left + shift < margin) shift = margin - rect.left;
      node.style.left = `${shift}px`;
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  function dismiss() {
    setDismissed(true);
    setClicked(false);
  }

  return (
    <span
      ref={wrapper}
      className="relative inline-flex align-middle"
      onMouseEnter={() => {
        setHovered(true);
        setDismissed(false);
      }}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        }
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => {
          if (clicked) {
            dismiss();
          } else {
            setDismissed(false);
            setClicked(true);
          }
        }}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onBlur={(event) => {
          if (!wrapper.current?.contains(event.relatedTarget as Node)) {
            setFocused(false);
            setClicked(false);
          }
        }}
        className="text-muted hover:text-fg1 focus-visible:ring-accent-bright inline-flex cursor-pointer items-center justify-center rounded-full focus-visible:ring-1 focus-visible:outline-none"
      >
        <i className="bi-question-circle icon-sm" aria-hidden="true" />
      </button>
      {open && (
        <span
          ref={tooltip}
          role="tooltip"
          id={id}
          className="bg-bg3 border-tertiary text-fg1 absolute top-full left-0 z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] space-y-1 rounded-lg border p-3 text-xs leading-relaxed shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}
