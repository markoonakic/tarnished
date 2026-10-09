import Button from '@/components/ui/Button';
import PopoverLayer from './ui/PopoverLayer';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import type { DropdownOption } from './Dropdown';

interface SearchableComboboxProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  containerBackground?: 'bg0' | 'bg1' | 'bg2' | 'bg3' | 'bg4';
  id?: string;
  noResultsText?: string;
  onCreate?: (name: string) => void;
}

const triggerClasses = {
  bg0: 'bg-bg1',
  bg1: 'bg-bg2',
  bg2: 'bg-bg3',
  bg3: 'bg-bg4',
  bg4: 'bg-bg-h',
} as const;

function filterOptions(
  options: DropdownOption[],
  query: string
): DropdownOption[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return options;
  }

  const startsWith: DropdownOption[] = [];
  const includes: DropdownOption[] = [];

  for (const option of options) {
    const label = option.label.toLowerCase();
    if (label.startsWith(normalizedQuery)) {
      startsWith.push(option);
    } else if (label.includes(normalizedQuery)) {
      includes.push(option);
    }
  }

  return [...startsWith, ...includes];
}

export default function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder = t('Search…'),
  disabled = false,
  containerBackground = 'bg1',
  id,
  noResultsText = t('No matches found.'),
  onCreate,
}: SearchableComboboxProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listboxId = useId();

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );
  const [inputValue, setInputValue] = useState(selectedOption?.label ?? '');
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const query = inputValue.trim();
  const createOption = useMemo(
    () =>
      onCreate &&
      query &&
      !options.some(
        (option) => option.label.trim().toLowerCase() === query.toLowerCase()
      )
        ? { value: '\u0000create', label: t('kit.createName', { name: query }) }
        : null,
    [onCreate, options, query, t]
  );
  const filteredOptions = useMemo(
    () => [
      ...filterOptions(options, inputValue),
      ...(createOption ? [createOption] : []),
    ],
    [options, inputValue, createOption]
  );

  useEffect(() => {
    if (!isOpen) {
      setInputValue(selectedOption?.label ?? '');
      setFocusedIndex(-1);
    }
  }, [isOpen, selectedOption?.label]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const selectedIndex = filteredOptions.findIndex(
      (option) => option.value === value
    );
    setFocusedIndex(
      selectedIndex >= 0 ? selectedIndex : filteredOptions.length > 0 ? 0 : -1
    );
  }, [filteredOptions, isOpen, value]);

  useEffect(() => {
    if (!isOpen || focusedIndex < 0) {
      return;
    }

    const focusedOption = optionRefs.current[focusedIndex];
    if (focusedOption && typeof focusedOption.scrollIntoView === 'function') {
      focusedOption.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex, isOpen]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
      setInputValue(selectedOption?.label ?? '');
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [selectedOption?.label]);

  function openCombobox() {
    if (disabled) {
      return;
    }
    setIsOpen(true);
  }

  function closeCombobox() {
    setIsOpen(false);
    setInputValue(selectedOption?.label ?? '');
  }

  function handleSelect(option: DropdownOption) {
    if (disabled) return;
    if (option === createOption) onCreate?.(query);
    else onChange(option.value);
    setInputValue(option === createOption ? query : option.label);
    setIsOpen(false);
    setFocusedIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled || event.nativeEvent.isComposing) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          return;
        }
        setFocusedIndex((current) =>
          Math.min(filteredOptions.length - 1, current + 1)
        );
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          return;
        }
        setFocusedIndex((current) => Math.max(0, current - 1));
        break;
      }
      case 'Enter': {
        if (!isOpen || focusedIndex < 0) {
          return;
        }
        event.preventDefault();
        const option = filteredOptions[focusedIndex];
        if (option) {
          handleSelect(option);
        }
        break;
      }
      case 'Escape': {
        if (isOpen) {
          event.preventDefault();
          event.stopPropagation();
          closeCombobox();
        }
        break;
      }
      case 'Tab': {
        closeCombobox();
        break;
      }
      case 'Home': {
        if (!isOpen) return;
        event.preventDefault();
        setFocusedIndex(0);
        break;
      }
      case 'End': {
        if (!isOpen) return;
        event.preventDefault();
        setFocusedIndex(filteredOptions.length - 1);
        break;
      }
      case 'PageDown': {
        if (!isOpen) return;
        event.preventDefault();
        setFocusedIndex((current) =>
          Math.min(filteredOptions.length - 1, current + 10)
        );
        break;
      }
      case 'PageUp': {
        if (!isOpen) return;
        event.preventDefault();
        setFocusedIndex((current) => Math.max(0, current - 10));
        break;
      }
      default:
        break;
    }
  }

  const triggerBackground =
    triggerClasses[containerBackground as keyof typeof triggerClasses];

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeCombobox();
      }}
    >
      <div
        className={`${triggerBackground} focus-within:ring-accent-bright overflow-hidden rounded transition-all duration-200 ease-in-out focus-within:ring-1`}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          value={inputValue}
          onFocus={openCombobox}
          onClick={openCombobox}
          onChange={(event) => {
            setInputValue(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && filteredOptions[focusedIndex]
              ? `${listboxId}-option-${focusedIndex}`
              : undefined
          }
          className={`text-fg1 placeholder-muted block h-full w-full bg-transparent px-4 py-2 pr-12 text-sm transition-all duration-200 ease-in-out focus:outline-none ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          placeholder={selectedOption?.label ?? placeholder}
        />
        <Button
          variant="icon"
          type="button"
          onClick={() => {
            if (isOpen) {
              closeCombobox();
            } else {
              inputRef.current?.focus();
              openCombobox();
            }
          }}
          disabled={disabled}
          aria-label={isOpen ? t('Close options') : t('Open options')}
          className="absolute inset-y-0 right-0 flex h-full items-center"
        >
          <i
            className={`bi-chevron-down icon-md transition-transform duration-200 ease-in-out ${isOpen ? 'rotate-180' : ''}`}
          />
        </Button>
      </div>

      <PopoverLayer id={listboxId} open={isOpen && !disabled} role="listbox">
        <div className="max-h-72 overflow-y-auto overscroll-contain">
          {filteredOptions.length === 0 ? (
            <div className="text-muted px-4 py-3 text-sm">{noResultsText}</div>
          ) : (
            filteredOptions.map((option, index) => {
              const isSelected = option.value === value;
              const isFocused = focusedIndex === index;

              return (
                <Button
                  key={option.value}
                  id={`${listboxId}-option-${index}`}
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={isSelected}
                  onMouseEnter={() => setFocusedIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(option)}
                  className={`w-full justify-between text-left ${isFocused ? '' : ''} `}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <i className="bi-check icon-md text-green" />}
                </Button>
              );
            })
          )}
        </div>
      </PopoverLayer>
    </div>
  );
}
