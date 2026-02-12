import { useTheme } from '../../contexts/ThemeContext';
import ThemeDropdown from '../ThemeDropdown';
import { SettingsBackLink } from './SettingsLayout';

export default function SettingsTheme() {
  const { currentTheme, setTheme: handleThemeChange, themes, currentAccent, setAccentColor, accentOptions } = useTheme();

  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-xl font-bold text-fg1 mb-4">Theme</h2>
        <p className="text-sm text-muted mb-4">
          Choose your preferred color theme for the application.
        </p>
        <ThemeDropdown
          themes={themes}
          currentTheme={currentTheme}
          onChange={handleThemeChange}
        />
      </div>

      <div className="bg-secondary rounded-lg p-4 md:p-6 mt-4">
        <h2 className="text-xl font-bold text-fg1 mb-4">Accent Color</h2>
        <p className="text-sm text-muted mb-4">
          Choose the accent color for buttons, links, and focus indicators.
        </p>
        <div className="flex gap-3 flex-wrap">
          {accentOptions.map((option) => (
            <button
              key={option.name}
              type="button"
              title={option.name.charAt(0).toUpperCase() + option.name.slice(1)}
              onClick={() => setAccentColor(option.name)}
              className={`w-8 h-8 rounded-full cursor-pointer transition-all duration-200 ease-in-out
                ${currentAccent === option.name
                  ? 'ring-2 ring-fg1 ring-offset-2 ring-offset-bg1'
                  : 'hover:ring-1 hover:ring-fg4'
                }`}
              style={{ backgroundColor: `var(${option.cssVar})` }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
