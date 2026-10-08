import { useId } from 'react';
import type { ReactNode } from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="bg-bg2 inline-flex gap-1 rounded-md p-1"
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={`focus-within:ring-accent cursor-pointer rounded px-3 py-1 text-sm transition-all duration-200 ease-in-out focus-within:ring-2 ${option.value === value ? 'bg-bg3 text-fg0' : 'text-fg4 hover:text-fg1'} ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          <input
            className="sr-only"
            type="radio"
            name={id}
            value={option.value}
            checked={option.value === value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
