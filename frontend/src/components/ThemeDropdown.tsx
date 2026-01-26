import { useState, useRef, useEffect } from 'react';

interface Theme {
  id: string;
  name: string;
  swatches: string[];
}

interface Props {
  themes: Theme[];
  currentTheme: string;
  onChange: (themeId: string) => void;
}

export default function ThemeDropdown({ themes, currentTheme, onChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedTheme = themes.find((t) => t.id === currentTheme) || themes[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(themeId: string) {
    onChange(themeId);
    setIsOpen(false);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2 bg-tertiary border border-muted rounded text-left hover:border-accent-aqua focus:outline-none focus:border-accent-aqua transition-all duration-200"
      >
        <div className="flex items-center gap-3">
          <span className="text-primary font-medium">{selectedTheme.name}</span>
          <div className="flex gap-1">
            {selectedTheme.swatches.map((color, i) => (
              <div
                key={i}
                className="w-4 h-4 rounded"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
        <i className={`bi bi-chevron-down text-muted transition-transform inline-block ${isOpen ? 'rotate-180' : ''}`} style={{fontSize: '1.25rem'}} />
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-secondary border border-muted rounded-lg shadow-lg overflow-hidden">
          {themes.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => handleSelect(theme.id)}
              className={`w-full flex items-center justify-between px-4 py-2 text-left hover:bg-tertiary transition-all duration-200 ${
                theme.id === currentTheme ? 'bg-tertiary' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-primary">{theme.name}</span>
                <div className="flex gap-1">
                  {theme.swatches.map((color, i) => (
                    <div
                      key={i}
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              {theme.id === currentTheme && (
                <i className="bi bi-check-lg text-accent-aqua" style={{fontSize: '1.25rem'}} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
