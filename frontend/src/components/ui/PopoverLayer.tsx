import { useLayoutEffect, useRef, type ComponentProps } from 'react';

/** Native top-layer placement escapes card clipping and modal fieldsets. */
export default function PopoverLayer({
  open = true,
  className = '',
  style,
  children,
  ...props
}: ComponentProps<'div'> & { open?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current!;
    const details = node.parentElement?.closest('details');
    const place = () => {
      const visible = open && (!details || details.open);
      node.style.display = open ? '' : 'none';
      if (!visible) {
        node.hidePopover?.();
        return;
      }
      node.showPopover?.();
      const anchor = (
        details?.querySelector('summary') ?? node.parentElement
      )?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(
        window.innerWidth - 16,
        style?.width
          ? parseFloat(String(style.width))
          : Math.max(anchor.width, 192)
      );
      node.style.width = `${width}px`;
      node.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
      const height = Math.min(node.scrollHeight, 288);
      const below = window.innerHeight - anchor.bottom - 8;
      const above = anchor.top - 8;
      const useAbove = below < height && above > below;
      node.style.maxHeight = `${Math.max(80, useAbove ? above : below)}px`;
      node.style.top = `${useAbove ? Math.max(8, anchor.top - height - 4) : anchor.bottom + 4}px`;
    };
    place();
    details?.addEventListener('toggle', place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      details?.removeEventListener('toggle', place);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, style?.width]);
  return (
    <div
      {...props}
      ref={ref}
      popover={
        typeof HTMLElement !== 'undefined' &&
        'showPopover' in HTMLElement.prototype
          ? 'manual'
          : undefined
      }
      data-ui="popover"
      aria-hidden={!open}
      inert={!open}
      className={`bg-bg0 border-tertiary text-fg1 fixed z-[1000] m-0 overflow-y-auto rounded-lg border shadow-xl ${className}`}
      style={{ ...style, display: open ? undefined : 'none' }}
    >
      {children}
    </div>
  );
}
