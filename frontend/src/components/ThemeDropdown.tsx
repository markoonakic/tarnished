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
        className="w-full flex items-center justify-between px-4 py-2 bg-bg1 border border-muted rounded text-fg1 hover:border-aqua focus:outline-none focus:border-aqua transition-all duration-200 cursor-pointer"
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

      <div
        className="absolute z-10 w-full mt-1 bg-secondary border border-muted rounded-lg overflow-hidden transition-all duration-200"
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          {themes.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => handleSelect(theme.id)}
              className={`w-full flex items-center justify-between px-4 py-2 text-fg1 text-left hover:bg-bg1 transition-all duration-200 cursor-pointer ${
                theme.id === currentTheme ? 'bg-bg1' : ''
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
      </div>
    </div>
  );
}
