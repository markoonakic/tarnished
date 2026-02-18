import { useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
  autoComplete?: string;
}

export default function PasswordInput({ value, onChange, label, required = false, autoComplete }: Props) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div>
      <label className="block mb-1 text-sm font-semibold text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          autoComplete={autoComplete}
          className="w-full px-3 py-2 pr-10 bg-bg2 rounded text-fg1 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-transparent text-fg1 hover:text-fg0 transition-all duration-200 ease-in-out rounded cursor-pointer"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'} text-lg`} />
        </button>
      </div>
    </div>
  );
}
