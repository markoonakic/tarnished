import Button from '@/components/ui/Button';
import { t, uiLabel } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import ThemeDropdown from '../ThemeDropdown';
import { SettingsBackLink } from './SettingsLayout';

export default function SettingsTheme() {
  useTranslation();
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
        <h2 className="text-fg1 mb-4 text-xl font-bold">{t('Theme')}</h2>
        <p className="text-muted mb-4 text-sm">
          {t('Choose your preferred color theme for the application.')}
        </p>
        <ThemeDropdown
          themes={themes}
          currentTheme={currentTheme}
          onChange={handleThemeChange}
        />
      </div>

      <div className="bg-secondary mt-4 rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 mb-4 text-xl font-bold">{t('Accent Color')}</h2>
        <p className="text-muted mb-4 text-sm">
          {t(
            'Choose the accent color for buttons, links, and focus indicators.'
          )}
        </p>
        <div className="flex flex-wrap gap-3">
          {accentOptions.map((option) => (
            <Button
              key={option.name}
              variant="icon"
              type="button"
              aria-label={uiLabel(
                option.name.charAt(0).toUpperCase() + option.name.slice(1)
              )}
              aria-pressed={currentAccent === option.name}
              title={uiLabel(
                option.name.charAt(0).toUpperCase() + option.name.slice(1)
              )}
              onClick={() => setAccentColor(option.name)}
              className="h-10 w-10"
            >
              <span
                className="block h-full w-full rounded-full"
                style={{ backgroundColor: `var(${option.cssVar})` }}
              />
            </Button>
          ))}
        </div>
      </div>
    </>
  );
}
