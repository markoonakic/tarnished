import { useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
  autoComplete?: string;
}

export default function PasswordInput({
  value,
  onChange,
  label,
  required = false,
  autoComplete,
}: Props) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div>
      <label className="text-muted mb-1 block text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          autoComplete={autoComplete}
          className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 pr-10 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="text-fg1 hover:text-fg0 absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded bg-transparent px-3 py-1.5 transition-all duration-200 ease-in-out"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          <i
            className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'} text-lg`}
          />
        </button>
      </div>
    </div>
  );
}
