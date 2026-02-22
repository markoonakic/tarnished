import { useState, useRef, useEffect, type KeyboardEvent } from 'react';

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

// Icon sizing using dedicated icon utilities (see index.css)
// Bootstrap Icons ::before inherits font-size, enabling consistent sizing
const iconSizeClasses = {
  xs: 'icon-xs', // 12px - match xs dropdown
  sm: 'icon-sm', // 14px - match sm dropdown
  md: 'icon-md', // 16px - match md dropdown
  lg: 'icon-lg', // 18px - match lg dropdown
};

// Background layer mappings for 6-layer rule: bg0 -> bg1 -> bg2 -> bg3 -> bg4 -> bg-h -> (wrap)
// Per DESIGN_GUIDELINES.md: Trigger = container + 1, Selected = container + 2, Hover = container + 3
const getLayerClass = (baseLayer: string, offset: number): string => {
  const layers = ['bg-bg0', 'bg-bg1', 'bg-bg2', 'bg-bg3', 'bg-bg4', 'bg-bg-h'];
  const baseIndex = layers.indexOf(`bg-${baseLayer}`);
  if (baseIndex === -1) return 'bg-bg1'; // default fallback

  const targetIndex = (baseIndex + offset) % 6;
  return layers[targetIndex];
};

// Static class mappings for Tailwind JIT compatibility
// These must be complete class strings that Tailwind can detect at build time
// Per 6-layer rule: non-selected = container + 1 layer (base state)
const nonSelectedClasses = {
  bg0: 'bg-bg1', // bg0 + 1
  bg1: 'bg-bg2', // bg1 + 1
  bg2: 'bg-bg3', // bg2 + 1
  bg3: 'bg-bg4', // bg3 + 1
  bg4: 'bg-bg-h', // bg4 + 1
} as const;

// Per 6-layer rule: hover = container + 3 layers
const hoverClasses = {
  bg0: 'hover:bg-bg3', // bg0 + 3
  bg1: 'hover:bg-bg4', // bg1 + 3
  bg2: 'hover:bg-bg-h', // bg2 + 3
  bg3: 'hover:bg-bg0', // bg3 + 3 (wrap)
  bg4: 'hover:bg-bg1', // bg4 + 3 (wrap)
} as const;

// Per 6-layer rule: selected = container + 2 layers
const selectedClasses = {
  bg0: 'bg-bg2', // bg0 + 2
  bg1: 'bg-bg3', // bg1 + 2
  bg2: 'bg-bg4', // bg2 + 2
  bg3: 'bg-bg-h', // bg3 + 2
  bg4: 'bg-bg0', // bg4 + 2 (wrap)
} as const;

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
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Use static class mappings for Tailwind JIT compatibility
  const triggerBg = getLayerClass(containerBackground, 1);
  const nonSelectedBg =
    nonSelectedClasses[containerBackground as keyof typeof nonSelectedClasses];
  const selectedBg =
    selectedClasses[containerBackground as keyof typeof selectedClasses];
  const hoverClass =
    hoverClasses[containerBackground as keyof typeof hoverClasses];

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

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener(
      'keydown',
      handleEscape as unknown as EventListener
    );
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener(
        'keydown',
        handleEscape as unknown as EventListener
      );
    };
  }, []);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setFocusedIndex(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (isOpen && focusedIndex >= 0) {
          handleSelect(options[focusedIndex].value);
        } else {
          setIsOpen(!isOpen);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setFocusedIndex(0);
        } else {
          setFocusedIndex((prev) => (prev + 1) % options.length);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setFocusedIndex(options.length - 1);
        } else {
          setFocusedIndex(
            (prev) => (prev - 1 + options.length) % options.length
          );
        }
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(options.length - 1);
        break;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        id={id}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls="dropdown-listbox"
        aria-selected={!!selectedOption}
        aria-disabled={disabled}
        className={`flex w-full items-center justify-between gap-3 ${triggerBg} text-fg1 hover:border-accent-bright focus:ring-accent-bright rounded border-0 focus:ring-1 focus:outline-none ${isOpen ? 'ring-accent-bright ring-1' : ''} ${sizeClasses[size]} transition-all duration-200 ease-in-out ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} `}
      >
        <span className={selectedOption ? 'text-fg1' : 'text-fg4'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <i
          className={`bi-chevron-down ${iconSizeClasses[size]} text-fg4 transition-transform duration-200 ease-in-out ${isOpen ? 'rotate-180' : ''} `}
        />
      </button>

      <div
        id="dropdown-listbox"
        className={`bg-bg0 absolute z-10 mt-1 w-full overflow-hidden rounded-lg border-0 transition-all duration-200 ease-in-out ${isOpen ? 'ring-accent-bright ring-1' : ''} `}
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'translateY(0)' : 'translateY(-0.5rem)',
        }}
        role="listbox"
        aria-activedescendant={
          focusedIndex >= 0 ? `option-${focusedIndex}` : undefined
        }
      >
        <div style={{ overflow: 'hidden' }}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isFocused = focusedIndex === index;

            return (
              <button
                key={option.value}
                id={`option-${index}`}
                type="button"
                onClick={() => handleSelect(option.value)}
                onMouseEnter={() => setFocusedIndex(index)}
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
