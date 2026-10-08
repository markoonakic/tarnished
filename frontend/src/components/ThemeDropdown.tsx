import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import Dropdown from './Dropdown';

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

export default function ThemeDropdown({
  themes,
  currentTheme,
  onChange,
}: Props) {
  useTranslation();
  return (
    <Dropdown
      options={themes.map((theme) => ({
        value: theme.id,
        label: theme.name,
      }))}
      value={currentTheme}
      onChange={onChange}
      placeholder={t('Select theme')}
      containerBackground="bg1"
    />
  );
}
