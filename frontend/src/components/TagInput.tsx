import Button from '@/components/ui/Button';
import { MAX_TAG_LENGTH, MAX_TAGS } from '@/lib/recordFilters';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
export default function TagInput({
  value,
  onChange,
  label,
  id,
  disabled = false,
  placeholder,
  maxLength = MAX_TAG_LENGTH,
  maxTags = MAX_TAGS,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  label: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  maxTags?: number;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  function add(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || !['Enter', ','].includes(event.key))
      return;
    event.preventDefault();
    const tag = draft.trim();
    if (
      tag &&
      tag.length <= maxLength &&
      value.length < maxTags &&
      !value.some((item) => item.toLowerCase() === tag.toLowerCase())
    )
      onChange([...value, tag]);
    setDraft('');
  }
  return (
    <div className="bg-bg2 focus-within:ring-accent flex flex-wrap items-center gap-1.5 rounded-md p-2 focus-within:ring-2">
      {value.map((tag, index) => (
        <span
          key={tag}
          className="bg-bg3 text-fg2 flex max-w-full min-w-0 items-center gap-1 rounded px-2 py-0.5 text-xs"
        >
          <span className="min-w-0 truncate" title={tag}>
            {tag}
          </span>
          <Button
            variant="icon"
            type="button"
            disabled={disabled}
            aria-label={t('kit.removeTag', { tag })}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            className="flex items-center gap-1.5"
          >
            ×
          </Button>
        </span>
      ))}
      <input
        id={id}
        aria-label={label}
        value={draft}
        disabled={disabled || value.length >= maxTags}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
        onKeyDown={add}
        placeholder={placeholder ?? t('kit.addTag')}
        className="text-fg1 placeholder:text-fg4 min-w-0 flex-1 basis-20 bg-transparent px-1 py-0.5 text-sm outline-none"
      />
    </div>
  );
}
