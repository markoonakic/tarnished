import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useId, useState } from 'react';

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
  useTranslation();
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div>
      <label
        htmlFor={id}
        className="text-muted mb-1 block text-sm font-semibold"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          autoComplete={autoComplete}
          className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 pr-10 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
        />
        <Button
          variant="icon"
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute top-1/2 right-2 -translate-y-1/2"
          aria-label={showPassword ? t('Hide password') : t('Show password')}
        >
          <i
            className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'} text-lg`}
          />
        </Button>
      </div>
    </div>
  );
}
