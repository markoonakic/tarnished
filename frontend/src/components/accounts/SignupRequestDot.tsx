import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiV030 } from '@/lib/apiV030';
import { observeRead } from '@/lib/queryClient';

export default function SignupRequestDot() {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);
  useEffect(() => {
    async function load() {
      try {
        setCount((await apiV030.adminStats()).pending_users);
      } catch (error) {
        return { error };
      }
    }
    const stop = observeRead(load);
    const updated = () => void load();
    window.addEventListener('accounts-updated', updated);
    return () => {
      stop();
      window.removeEventListener('accounts-updated', updated);
    };
  }, []);
  return count > 0 ? (
    <span
      className="bg-yellow ml-2 inline-block h-2 w-2 shrink-0 rounded-full"
      role="status"
      aria-label={t('accounts.pendingCount', { count })}
      title={t('accounts.pendingCount', { count })}
    />
  ) : null;
}
