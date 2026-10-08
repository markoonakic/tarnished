import { useTranslation } from 'react-i18next';

export default function AiToggle({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  const { t } = useTranslation();
  return (
    <label
      className={`text-fg4 flex items-center gap-2 text-xs ${disabled ? 'opacity-40' : 'cursor-pointer'}`}
    >
      <span>{label ?? t('kit.ai')}</span>
      <span
        className={`focus-within:ring-accent relative inline-block h-5 w-9 rounded-full focus-within:ring-2 ${checked ? 'bg-accent' : 'bg-bg3'}`}
      >
        <input
          type="checkbox"
          role="switch"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className={`bg-fg0 absolute top-0.5 left-0.5 h-4 w-4 rounded-full transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
        />
      </span>
    </label>
  );
}
