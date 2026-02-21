import { useTheme } from '../../contexts/ThemeContext';
import ThemeDropdown from '../ThemeDropdown';
import { SettingsBackLink } from './SettingsLayout';

export default function SettingsTheme() {
  const {
    currentTheme,
    setTheme: handleThemeChange,
    themes,
    currentAccent,
    setAccentColor,
    accentOptions,
  } = useTheme();

  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 mb-4 text-xl font-bold">Theme</h2>
        <p className="text-muted mb-4 text-sm">
          Choose your preferred color theme for the application.
        </p>
        <ThemeDropdown
          themes={themes}
          currentTheme={currentTheme}
          onChange={handleThemeChange}
        />
      </div>

      <div className="bg-secondary mt-4 rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 mb-4 text-xl font-bold">Accent Color</h2>
        <p className="text-muted mb-4 text-sm">
          Choose the accent color for buttons, links, and focus indicators.
        </p>
        <div className="flex flex-wrap gap-3">
          {accentOptions.map((option) => (
            <button
              key={option.name}
              type="button"
              title={option.name.charAt(0).toUpperCase() + option.name.slice(1)}
              onClick={() => setAccentColor(option.name)}
              className={`h-8 w-8 cursor-pointer rounded-full transition-all duration-200 ease-in-out ${
                currentAccent === option.name
                  ? 'ring-fg1 ring-offset-bg1 ring-2 ring-offset-2'
                  : 'hover:ring-fg4 hover:ring-1'
              }`}
              style={{ backgroundColor: `var(${option.cssVar})` }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
