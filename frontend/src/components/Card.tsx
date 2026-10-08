import type { ReactNode } from 'react';

export interface CardHeaderProps {
  title: ReactNode;
  icon?: string;
  count?: number;
  actions?: ReactNode;
}
export function CardHeader({ title, icon, count, actions }: CardHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {icon && (
          <i className={`bi ${icon} text-accent icon-md`} aria-hidden="true" />
        )}
        <h3 className="text-fg1 text-lg font-semibold">{title}</h3>
        {count !== undefined && (
          <span className="bg-tertiary text-fg4 rounded-full px-2 py-0.5 text-xs">
            {count}
          </span>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-1">{actions}</div>
      )}
    </div>
  );
}
export default function Card({
  children,
  className = '',
  ...header
}: CardHeaderProps & { children: ReactNode; className?: string }) {
  return (
    <section className={`bg-secondary mb-6 rounded-lg p-6 ${className}`}>
      <CardHeader {...header} />
      {children}
    </section>
  );
}
