import Button, { type ButtonProps } from '@/components/ui/Button';
import { useTranslation } from 'react-i18next';
import { useRef, type InputHTMLAttributes, type ReactNode } from 'react';

export default function FileButton({
  children,
  className,
  variant = 'ghost',
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & {
  children: ReactNode;
  variant?: ButtonProps['variant'];
}) {
  useTranslation();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        variant={variant}
        type="button"
        className={className}
        disabled={inputProps.disabled}
        onClick={() => input.current?.click()}
      >
        {children}
      </Button>
      <input {...inputProps} ref={input} type="file" className="hidden" />
    </>
  );
}
