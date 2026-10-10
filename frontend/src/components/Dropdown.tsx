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

export interface DropdownOption {
  value: string;
  label: string;
  icon?: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  containerBackground?: 'bg0' | 'bg1' | 'bg2' | 'bg3' | 'bg4';
  id?: string;
}

// Field colors as in v0.2.5: one step lighter than the card the field sits on.
const fieldClasses = {
  bg0: 'bg-bg1 hover:bg-bg2',
  bg1: 'bg-bg2 hover:bg-bg3',
  bg2: 'bg-bg3 hover:bg-bg4',
  bg3: 'bg-bg4 hover:bg-bg-h',
  bg4: 'bg-bg-h hover:bg-bg0',
} as const;

const TYPEAHEAD_RESET_MS = 500;
const PAGE_JUMP_SIZE = 10;

function findMatchingOptionIndex(
  options: DropdownOption[],
  search: string,
  startIndex: number
): number {
  const normalizedSearch = search.toLowerCase();
  if (!normalizedSearch) {
    return -1;
  }

  const orderedIndexes = [
    ...Array.from(
      { length: options.length - startIndex },
      (_, index) => startIndex + index
    ),
    ...Array.from({ length: startIndex }, (_, index) => index),
  ];

  for (const index of orderedIndexes) {
    if (options[index]?.label.toLowerCase().startsWith(normalizedSearch)) {
      return index;
    }
  }

  return -1;
}

export default function Dropdown({
  options,
  value,
  onChange,
  placeholder = t('Select...'),
  disabled = false,
  containerBackground = 'bg1',
  id,
}: DropdownProps) {
  useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const typeaheadRef = useRef('');
  const typeaheadTimeoutRef = useRef<number | null>(null);
  const listboxId = useId();
  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );
  const selectedIndex = useMemo(
    () => options.findIndex((opt) => opt.value === value),
    [options, value]
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!isOpen || focusedIndex < 0) {
      return;
    }

    const focusedOption = optionRefs.current[focusedIndex];
    if (focusedOption && typeof focusedOption.scrollIntoView === 'function') {
      focusedOption.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [focusedIndex, isOpen]);

  useEffect(() => {
    return () => {
      if (typeaheadTimeoutRef.current !== null) {
        window.clearTimeout(typeaheadTimeoutRef.current);
      }
    };
  }, []);

  const handleSelect = (optionValue: string) => {
    if (disabled) return;
    onChange(optionValue);
    triggerRef.current?.focus();
    setIsOpen(false);
    setFocusedIndex(-1);
  };

  const moveFocus = (nextIndex: number) => {
    if (options.length === 0) {
      setFocusedIndex(-1);
      return;
    }

    const normalizedIndex = Math.max(
      0,
      Math.min(options.length - 1, nextIndex)
    );
    setFocusedIndex(normalizedIndex);
  };

  const handleTypeahead = (character: string) => {
    const nextSearch = `${typeaheadRef.current}${character.toLowerCase()}`;
    const startIndex = focusedIndex >= 0 ? focusedIndex + 1 : 0;
    const matchIndex = findMatchingOptionIndex(options, nextSearch, startIndex);

    typeaheadRef.current = nextSearch;
    if (typeaheadTimeoutRef.current !== null) {
      window.clearTimeout(typeaheadTimeoutRef.current);
    }
    typeaheadTimeoutRef.current = window.setTimeout(() => {
      typeaheadRef.current = '';
    }, TYPEAHEAD_RESET_MS);

    if (matchIndex >= 0) {
      if (!isOpen) {
        setIsOpen(true);
      }
      setFocusedIndex(matchIndex);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (
      event.key.length === 1 &&
      event.key !== ' ' &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      handleTypeahead(event.key);
      return;
    }

    switch (event.key) {
      case 'Escape': {
        if (isOpen) {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(false);
          setFocusedIndex(-1);
        }
        break;
      }
      case 'Tab': {
        setIsOpen(false);
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (isOpen) {
          const option = options[focusedIndex];
          if (option) handleSelect(option.value);
        } else {
          setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
          setIsOpen(true);
        }
        break;
      }
      case 'ArrowDown': {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
        } else {
          moveFocus((focusedIndex + 1 + options.length) % options.length);
        }
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setFocusedIndex(
            selectedIndex >= 0 ? selectedIndex : options.length - 1
          );
        } else {
          moveFocus((focusedIndex - 1 + options.length) % options.length);
        }
        break;
      }
      case 'Home': {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        }
        moveFocus(0);
        break;
      }
      case 'End': {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        }
        moveFocus(options.length - 1);
        break;
      }
      case 'PageDown': {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
        } else {
          moveFocus(focusedIndex + PAGE_JUMP_SIZE);
        }
        break;
      }
      case 'PageUp': {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
        } else {
          moveFocus(focusedIndex - PAGE_JUMP_SIZE);
        }
        break;
      }
      default:
        break;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        ref={triggerRef}
        type="button"
        id={id}
        onClick={() => {
          setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
          setIsOpen((open) => !open);
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        role="combobox"
        aria-label={id ? undefined : placeholder}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-activedescendant={
          isOpen && options[focusedIndex]
            ? `${listboxId}-option-${focusedIndex}`
            : undefined
        }
        aria-disabled={disabled}
        variant="field"
        className={`${fieldClasses[containerBackground]} ${isOpen ? 'ring-accent-bright ring-1' : ''}`}
      >
        <span className={selectedOption ? 'text-fg1' : 'text-fg4'}>
          {selectedOption?.icon && (
            <i
              className={`bi ${selectedOption.icon} mr-2`}
              aria-hidden="true"
            />
          )}
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <i
          className={`bi-chevron-down icon-sm text-fg4 transition-transform duration-200 ease-in-out ${isOpen ? 'rotate-180' : ''} `}
        />
      </Button>

      <PopoverLayer id={listboxId} open={isOpen} role="listbox">
        <div className="max-h-64 overflow-y-auto overscroll-contain">
          {isOpen &&
            options.map((option, index) => {
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
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setFocusedIndex(index)}
                  tabIndex={-1}
                  role="option"
                  aria-selected={isSelected}
                  className={`w-full justify-between rounded-none text-left ${isFocused ? 'bg-bg2 text-fg0' : ''}`}
                >
                  <span>
                    {option.icon && (
                      <i
                        className={`bi ${option.icon} mr-2`}
                        aria-hidden="true"
                      />
                    )}
                    {option.label}
                  </span>
                  {isSelected && (
                    <i
                      className={`bi-check icon-sm ${isFocused ? 'text-green-bright' : 'text-green'}`}
                    />
                  )}
                </Button>
              );
            })}
        </div>
      </PopoverLayer>
    </div>
  );
}
