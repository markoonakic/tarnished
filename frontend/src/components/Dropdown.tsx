import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';

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
  size?: 'sm' | 'md' | 'lg';
  containerBackground?: 'bg0' | 'bg1' | 'bg2' | 'bg3' | 'bg4';
}

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-5 py-2.5 text-lg',
};

const iconSizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

// Background layer mappings for 6-layer rule: bg0 -> bg1 -> bg2 -> bg3 -> bg4 -> bg-h -> (wrap)
const getLayerClass = (baseLayer: string, offset: number): string => {
  const layers = ['bg-bg0', 'bg-bg1', 'bg-bg2', 'bg-bg3', 'bg-bg4', 'bg-h'];
  const baseIndex = layers.indexOf(`bg-${baseLayer}`);
  if (baseIndex === -1) return 'bg-bg1'; // default fallback

  const targetIndex = (baseIndex + offset) % 6;
  return layers[targetIndex];
};

export default function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  size = 'md',
  containerBackground = 'bg1',
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Calculate background classes based on 6-layer rule
  const triggerBg = getLayerClass(containerBackground, 1);
  const selectedBg = getLayerClass(containerBackground, 2);
  const hoverBg = getLayerClass(containerBackground, 3);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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
    document.addEventListener('keydown', handleEscape as unknown as EventListener);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape as unknown as EventListener);
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
          setFocusedIndex((prev) => (prev - 1 + options.length) % options.length);
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
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-selected={!!selectedOption}
        aria-disabled={disabled}
        className={`
          w-full flex items-center justify-between gap-3
          ${triggerBg} border-0 rounded
          text-fg1 hover:border-aqua-bright
          focus:outline-none focus:border-aqua-bright
          ${isOpen ? 'border-aqua-bright' : ''}
          ${sizeClasses[size]}
          transition-all duration-200 ease-in-out
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <span className={selectedOption ? 'text-fg1' : 'text-fg4'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`
            ${iconSizeClasses[size]}
            text-fg4 transition-transform duration-200 ease-in-out
            ${isOpen ? 'rotate-180' : ''}
          `}
        />
      </button>

      <div
        className={`
          absolute z-10 w-full mt-1 rounded-lg overflow-hidden
          border-0 transition-all duration-200 ease-in-out
          ${isOpen ? 'border-aqua-bright' : ''}
        `}
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'translateY(0)' : 'translateY(-0.5rem)',
        }}
        role="listbox"
        aria-activedescendant={focusedIndex >= 0 ? `option-${focusedIndex}` : undefined}
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
                className={`
                  w-full text-left transition-all duration-200 ease-in-out cursor-pointer
                  ${sizeClasses[size]}
                  ${
                    isSelected
                      ? `${selectedBg} text-fg0`
                      : `bg-transparent text-fg1 ${hoverBg} hover:${hoverBg}`
                  }
                  ${isFocused ? hoverBg : ''}
                `}
              >
                {option.label}
                {isSelected && (
                  <span className="float-right text-aqua-bright">✓</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
