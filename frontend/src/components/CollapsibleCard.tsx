import { useId, useState, type ReactNode } from 'react';
import type { CardHeaderProps } from './Card';

export default function CollapsibleCard({
  title,
  icon,
  actions,
  count,
  children,
  defaultOpen = true,
  open,
  onOpenChange,
}: CardHeaderProps & {
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const id = useId();
  const isOpen = open ?? expanded;
  return (
    <section className="bg-secondary mb-6 rounded-lg p-6">
      <div
        className={`flex flex-wrap items-center justify-between gap-3 ${isOpen ? 'mb-4' : ''}`}
      >
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={id}
          onClick={() => {
            setExpanded(!isOpen);
            onOpenChange?.(!isOpen);
          }}
          className="text-fg1 focus:ring-accent flex cursor-pointer items-center gap-2 rounded text-lg font-semibold focus:ring-2"
        >
          <i
            className={`bi ${isOpen ? 'bi-chevron-down' : 'bi-chevron-right'} text-muted icon-sm`}
            aria-hidden="true"
          />
          {icon && (
            <i
              className={`bi ${icon} text-accent icon-md`}
              aria-hidden="true"
            />
          )}
          <span className="font-display">{title}</span>
          {count !== undefined && (
            <span className="bg-tertiary text-fg4 rounded-full px-2 py-0.5 text-xs">
              {count}
            </span>
          )}
        </button>
        {actions && (
          <div className="flex flex-wrap items-center gap-1">{actions}</div>
        )}
      </div>
      <div id={id} hidden={!isOpen}>
        {children}
      </div>
    </section>
  );
}
