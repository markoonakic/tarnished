import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
export default function TagInput({
  value,
  onChange,
  label,
  id,
  disabled = false,
  placeholder,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  label: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  function add(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || !['Enter', ','].includes(event.key))
      return;
    event.preventDefault();
    const tag = draft.trim();
    if (tag && !value.some((item) => item.toLowerCase() === tag.toLowerCase()))
      onChange([...value, tag]);
    setDraft('');
  }
  return (
    <div className="bg-bg2 focus-within:ring-accent flex flex-wrap items-center gap-1.5 rounded-md p-2 focus-within:ring-2">
      {value.map((tag, index) => (
        <span
          key={tag}
          className="bg-bg3 text-fg2 flex items-center gap-1 rounded px-2 py-0.5 text-xs"
        >
          {tag}
          <button
            type="button"
            disabled={disabled}
            aria-label={t('kit.removeTag', { tag })}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            className="focus:ring-accent cursor-pointer rounded focus:ring-2"
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        aria-label={label}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={add}
        placeholder={placeholder ?? t('kit.addTag')}
        className="text-fg1 placeholder:text-fg4 min-w-20 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
      />
    </div>
  );
}
