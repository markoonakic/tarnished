import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import {
  setNotificationsEnabled,
  useNotificationsEnabled,
} from '@/hooks/useReminderNotifications';
import HelpTip from '../HelpTip';
import AiToggle from '../AiToggle';

export default function ReminderNotificationSettings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const enabled = useNotificationsEnabled(user?.id);
  const supported = typeof Notification !== 'undefined';
  const [permission, setPermission] = useState(
    supported ? Notification.permission : 'unsupported'
  );
  const [busy, setBusy] = useState(false);
  return (
    <div className="bg-bg2 flex flex-wrap items-center justify-between gap-3 rounded-lg p-4">
      <div className="flex items-center gap-3 [&>label]:text-sm [&>label>span:last-child]:shrink-0">
        <AiToggle
          label={t('tasks.browserNotifications')}
          checked={enabled}
          disabled={!supported || !user || busy}
          onChange={async (checked) => {
            if (!user) return;
            if (!checked) {
              setNotificationsEnabled(user.id, false);
              return;
            }
            setBusy(true);
            try {
              const result = await Notification.requestPermission();
              setPermission(result);
              setNotificationsEnabled(user.id, result === 'granted');
            } catch {
              setPermission('unsupported');
            } finally {
              setBusy(false);
            }
          }}
        />
        <HelpTip label={t('tasks.browserNotifications')}>
          {t('tasks.notificationsHelp')}
        </HelpTip>
      </div>
      {(permission === 'denied' || permission === 'unsupported') && (
        <span role="status" className="text-muted text-sm">
          {t(
            permission === 'denied'
              ? 'tasks.notificationsDenied'
              : 'tasks.notificationsUnsupported'
          )}
        </span>
      )}
    </div>
  );
}
