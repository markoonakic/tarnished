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

export default function ThemeDropdown({ themes, currentTheme, onChange }: Props) {
  return (
    <Dropdown
      options={themes.map((theme) => ({
        value: theme.id,
        label: theme.name,
      }))}
      value={currentTheme}
      onChange={onChange}
      placeholder="Select theme"
      containerBackground="bg1"
    />
  );
}
