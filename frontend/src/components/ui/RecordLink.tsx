import type { LinkProps } from 'react-router-dom';
import TextLink from './TextLink';

/** The card owns its surface. The navigation element keeps the text-link contract. */
export default function RecordLink({
  children,
  className = '',
  ...props
}: LinkProps) {
  return (
    <div
      className={`bg-tertiary hover:bg-bg3 w-full cursor-pointer rounded-lg p-4 text-left transition-[translate,background-color] duration-200 ease-in-out will-change-transform hover:-translate-y-0.5 ${className}`}
    >
      <TextLink {...props} className="-m-4 block p-4">
        {children}
      </TextLink>
    </div>
  );
}
