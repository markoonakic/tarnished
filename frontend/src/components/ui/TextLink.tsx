import type { ComponentProps } from 'react';
import {
  Link,
  NavLink,
  type LinkProps,
  type NavLinkProps,
} from 'react-router-dom';

const style =
  'text-accent hover:text-accent-bright cursor-pointer text-sm transition-all duration-200 ease-in-out font-mono focus:ring-2 focus:ring-accent';
type Props = (LinkProps | (ComponentProps<'a'> & { to?: never })) & {
  variant?: 'text' | 'title';
};

export default function TextLink({
  className = '',
  variant = 'text',
  ...props
}: Props) {
  const classes = `${variant === 'title' ? 'text-fg1 hover:text-accent-bright font-medium transition-all duration-200 ease-in-out cursor-pointer text-sm font-mono focus:ring-2 focus:ring-accent' : style} ${className}`;
  return 'to' in props && props.to !== undefined ? (
    <Link {...(props as LinkProps)} className={classes} data-ui="link" />
  ) : (
    <a {...(props as ComponentProps<'a'>)} className={classes} data-ui="link" />
  );
}

export function NavigationLink({ className, ...props }: NavLinkProps) {
  return (
    <NavLink
      {...props}
      data-ui="link"
      className={(state) =>
        `${style} ${state.isActive ? 'underline underline-offset-4' : ''} ${typeof className === 'function' ? className(state) : (className ?? '')}`
      }
    />
  );
}
