import Button, { type ButtonProps } from '@/components/ui/Button';
import { useTranslation } from 'react-i18next';
import {
  useEffect,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

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
  const choosing = useRef(false);
  useEffect(() => {
    const element = input.current;
    const reset = () => {
      choosing.current = false;
    };
    element?.addEventListener('cancel', reset);
    return () => element?.removeEventListener('cancel', reset);
  }, []);
  return (
    <>
      <Button
        variant={variant}
        type="button"
        className={className}
        disabled={inputProps.disabled}
        onClick={() => {
          if (choosing.current || inputProps.disabled) return;
          choosing.current = true;
          input.current?.click();
        }}
      >
        {children}
      </Button>
      <input
        {...inputProps}
        onChange={(event) => {
          choosing.current = false;
          inputProps.onChange?.(event);
        }}
        ref={input}
        type="file"
        className="hidden"
      />
    </>
  );
}
