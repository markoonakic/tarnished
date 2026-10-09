import Button from '@/components/ui/Button';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import HelpTip from '../HelpTip';
import api from '@/lib/api';
import SegmentedControl from '@/components/SegmentedControl';

export default function ApplicationPostingCapture({
  statusId,
  onCreated,
}: {
  statusId: string;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function capture() {
    setBusy(true);
    setError(false);
    try {
      const { data } = await api.post<{ id: string }>(
        '/api/applications/extract',
        {
          url: mode === 'url' ? url : '',
          text: mode === 'text' ? text : undefined,
          status_id: statusId,
        }
      );
      onCreated(data.id);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="border-bg3 border-b p-4">
      <Button
        type="button"
        className="flex items-center gap-1.5"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <i className="bi-arrow-right icon-sm" aria-hidden="true" />
        {t('ai.fromPostingAction')}
      </Button>
      {open && (
        <div className="mt-3 space-y-3">
          <SegmentedControl
            label={t('ai.captureMethod')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'url', label: t('ai.fromUrl') },
              { value: 'text', label: t('ai.pasteText') },
            ]}
          />
          <HelpTip label={t('ai.captureMethod')}>
            {t('ai.preparingHint')}
          </HelpTip>
          {mode === 'url' ? (
            <label className="block text-sm">
              {t('ai.postingUrl')}
              <input
                type="url"
                className="bg-bg2 border-bg3 mt-1 w-full rounded border p-2"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={busy}
              />
            </label>
          ) : (
            <label className="block text-sm">
              {t('ai.postingText')}
              <textarea
                className="bg-bg2 border-bg3 mt-1 w-full rounded border p-2"
                rows={6}
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={busy}
              />
            </label>
          )}
          {text.length > 100000 && (
            <p className="text-red-bright text-sm">{t('ai.textLimit')}</p>
          )}
          {error && (
            <p role="alert" className="text-yellow-bright text-sm">
              {t('ai.loadFailed')}
            </p>
          )}
          <Button
            variant="primary"
            type="button"
            className="flex items-center gap-1.5"
            disabled={
              busy ||
              !statusId ||
              (mode === 'url'
                ? !/^https?:\/\//i.test(url)
                : !text.trim() || text.length > 100000)
            }
            onClick={() => void capture()}
          >
            <i className="bi-check2 icon-sm" aria-hidden="true" />
            {t(busy ? 'ai.queued' : 'ai.saveAndReview')}
          </Button>
        </div>
      )}
    </div>
  );
}
