import { useTranslation } from 'react-i18next';
export default function AiCheckbox({
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
      className={`text-fg4 flex items-center gap-1.5 text-xs ${disabled ? 'opacity-40' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent focus:ring-accent h-4 w-4 rounded focus:ring-2"
      />
      {label ?? t('kit.ai')}
    </label>
  );
}
