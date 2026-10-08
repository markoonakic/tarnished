import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import i18n from '@/lib/i18n';

export default function LanguagePreference() {
  const { user } = useAuth();
  const { data } = useUserPreferences({ enabled: Boolean(user) });
  useEffect(() => {
    if (user && data) void i18n.changeLanguage(data.language ?? 'en');
  }, [user, data]);
  return null;
}
