import { Children, isValidElement, type ComponentProps } from 'react';

const variants = {
  primary:
    'bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50',
  ghost:
    'text-fg1 hover:bg-bg2 hover:text-fg0 flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out disabled:opacity-50',
  danger:
    'text-red hover:bg-bg2 hover:text-red-bright flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out disabled:opacity-50',
  icon: 'text-muted hover:text-fg1 hover:bg-bg2 rounded p-1.5 cursor-pointer transition-all duration-200 ease-in-out',
  // Select-style trigger: the field background comes from Dropdown, as the v0.2.5 select.
  field:
    'text-fg1 flex w-full cursor-pointer items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm transition-all duration-200 ease-in-out focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
};

export type ButtonProps = ComponentProps<'button'> & {
  variant?: keyof typeof variants;
};

/** Actions share one visual contract. className is for layout, not a second skin. */
export default function Button({
  variant = 'ghost',
  type = 'button',
  className = '',
  children,
  title,
  ...props
}: ButtonProps) {
  const hasIcon = Children.toArray(children).some(
    (child) => isValidElement(child) && child.type === 'i'
  );
  return (
    <button
      {...props}
      type={type}
      title={title ?? (variant === 'icon' ? props['aria-label'] : undefined)}
      data-ui="button"
      data-variant={variant}
      className={`${variants[variant]} focus:ring-accent aria-pressed:ring-accent aria-selected:ring-accent font-mono text-sm focus:ring-2 aria-pressed:ring-1 aria-selected:ring-1 ${variant === 'primary' ? 'flex items-center justify-center gap-1.5' : ''} ${className}`}
    >
      {!hasIcon &&
        props.role !== 'option' &&
        (variant === 'ghost' || variant === 'danger') && (
          <i
            className={
              variant === 'danger'
                ? 'bi-trash icon-sm'
                : 'bi-arrow-right icon-sm'
            }
            aria-hidden="true"
          />
        )}
      {children}
    </button>
  );
}
