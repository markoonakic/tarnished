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

const sizeClasses = {
  xs: 'px-3 py-2 text-sm',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-5 py-2.5 text-lg',
};

const iconSizeClasses = {
  xs: 'icon-xs',
  sm: 'icon-sm',
  md: 'icon-md',
  lg: 'icon-lg',
};

const nonSelectedClasses = {
  bg0: 'bg-bg1',
  bg1: 'bg-bg2',
  bg2: 'bg-bg3',
  bg3: 'bg-bg4',
  bg4: 'bg-bg-h',
} as const;

const hoverClasses = {
  bg0: 'hover:bg-bg3',
  bg1: 'hover:bg-bg4',
  bg2: 'hover:bg-bg-h',
  bg3: 'hover:bg-bg0',
  bg4: 'hover:bg-bg1',
} as const;

const selectedClasses = {
  bg0: 'bg-bg2',
  bg1: 'bg-bg3',
  bg2: 'bg-bg4',
  bg3: 'bg-bg-h',
  bg4: 'bg-bg0',
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
  placeholder = 'Select...',
  disabled = false,
  size = 'md',
  containerBackground = 'bg1',
  id,
}: DropdownProps) {
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

  const nonSelectedBg = nonSelectedClasses[containerBackground];
  const selectedBg = selectedClasses[containerBackground];
  const hoverClass = hoverClasses[containerBackground];

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
      <button
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
        className={`flex w-full items-center justify-between gap-3 ${nonSelectedBg} text-fg1 hover:border-accent-bright focus:ring-accent-bright rounded border-0 focus:ring-1 focus:outline-none ${isOpen ? 'ring-accent-bright ring-1' : ''} ${sizeClasses[size]} transition-all duration-200 ease-in-out ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} `}
      >
        <span className={selectedOption ? 'text-fg1' : 'text-fg4'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <i
          className={`bi-chevron-down ${iconSizeClasses[size]} text-fg4 transition-transform duration-200 ease-in-out ${isOpen ? 'rotate-180' : ''} `}
        />
      </button>

      <div
        id={listboxId}
        className={`bg-bg0 absolute z-10 mt-1 w-full overflow-hidden rounded-lg border-0 transition-all duration-200 ease-in-out ${isOpen ? 'ring-accent-bright ring-1' : ''} `}
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'translateY(0)' : 'translateY(-0.5rem)',
        }}
        role="listbox"
        aria-hidden={!isOpen}
      >
        <div className="max-h-64 overflow-y-auto overscroll-contain">
          {isOpen &&
            options.map((option, index) => {
              const isSelected = option.value === value;
              const isFocused = focusedIndex === index;

              return (
                <button
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
                  className={`flex w-full cursor-pointer items-center justify-between text-left transition-all duration-200 ease-in-out ${sizeClasses[size]} ${
                    isSelected
                      ? `${selectedBg} text-fg0`
                      : `${nonSelectedBg} text-fg1 ${hoverClass}`
                  } ${isFocused ? 'bg-bg4' : ''} `}
                >
                  {option.label}
                  {isSelected && (
                    <i
                      className={`bi-check ${iconSizeClasses[size]} ${isFocused ? 'text-green-bright' : 'text-green'}`}
                    />
                  )}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
