import { useRef, type InputHTMLAttributes, type ReactNode } from 'react';

export default function FileButton({
  children,
  className,
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & {
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={inputProps.disabled}
        onClick={() => input.current?.click()}
      >
        {children}
      </button>
      <input {...inputProps} ref={input} type="file" className="hidden" />
    </>
  );
}
