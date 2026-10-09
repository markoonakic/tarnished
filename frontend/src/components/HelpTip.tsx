import Button from '@/components/ui/Button';
import { useTranslation } from 'react-i18next';
import { useId, useRef, useState } from 'react';
import PopoverLayer from './ui/PopoverLayer';
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
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = !dismissed && (hovered || focused || clicked);

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
      <Button
        variant="icon"
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
        className="focus-visible:ring-accent-bright inline-flex items-center justify-center focus-visible:ring-1 focus-visible:outline-none"
      >
        <i className="bi-question-circle icon-sm" aria-hidden="true" />
      </Button>
      {open && (
        <PopoverLayer
          role="tooltip"
          id={id}
          className="space-y-1 p-3 text-sm leading-relaxed"
          style={{ width: 256 }}
        >
          {children}
        </PopoverLayer>
      )}
    </span>
  );
}
