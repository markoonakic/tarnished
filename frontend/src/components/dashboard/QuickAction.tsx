import type { ReactNode } from 'react';
import Button from '@/components/ui/Button';
import TextLink from '@/components/ui/TextLink';

export default function QuickAction({
  children,
  icon,
  onClick,
  to,
}: {
  children: ReactNode;
  icon: string;
  onClick?: () => void;
  to?: string;
}) {
  const content = (
    <>
      <i className={`${icon} icon-md`} aria-hidden="true" />
      {children}
    </>
  );
  return (
    <div className="bg-secondary hover:bg-bg2 flex items-center rounded-lg p-4 transition-colors">
      {to ? (
        <TextLink to={to} className="flex w-full items-center gap-1.5">
          {content}
        </TextLink>
      ) : (
        <Button type="button" onClick={onClick} className="w-full text-left">
          {content}
        </Button>
      )}
    </div>
  );
}
