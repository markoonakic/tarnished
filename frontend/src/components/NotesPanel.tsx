import Button from '@/components/ui/Button';
import { formatDateTime } from '@/lib/displayDate';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import Card from './Card';
function NoteBody({ body }: { body: string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const node = ref.current!;
    const measure = () =>
      setLong(
        expanded ||
          node.scrollHeight > node.clientHeight ||
          body.split('\n').length > 6
      );
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [body, expanded]);
  return (
    <>
      <p
        ref={ref}
        className={
          expanded
            ? 'text-fg1 text-sm break-words whitespace-pre-wrap'
            : 'text-fg1 line-clamp-6 text-sm break-words whitespace-pre-wrap'
        }
      >
        {body}
      </p>
      {long && (
        <Button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="mt-2"
        >
          <i className="bi-arrow-right icon-sm" aria-hidden="true" />
          {t(expanded ? 'kit.showLess' : 'kit.showMore')}
        </Button>
      )}
    </>
  );
}
export interface NoteItem {
  id: string;
  body: string;
  created_at: string;
  updated_at?: string;
  revision?: number;
}
export interface NotesPanelProps {
  notes: NoteItem[];
  onAdd?: (body: string, requestKey: string) => void | Promise<void>;
  onEdit?: (id: string, body: string) => void | Promise<void>;
  onDelete?: (id: string) => void;
}
export default function NotesPanel({
  notes,
  onAdd,
  onEdit,
  onDelete,
}: NotesPanelProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  useUnsavedChanges(busy || (editing !== null && Boolean(body.trim())));
  function start(id: string, text = '') {
    requestKey.current = crypto.randomUUID();
    setEditing(id);
    setBody(text);
    setError(false);
  }
  async function save() {
    if (busy || !body.trim() || editing === null) return;
    setBusy(true);
    setError(false);
    try {
      if (editing === '') await onAdd?.(body.trim(), requestKey.current);
      else await onEdit?.(editing, body.trim());
      setEditing(null);
      setBody('');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const editor = (
    <div className="bg-tertiary mb-3 rounded-lg p-3">
      <textarea
        autoFocus
        aria-label={t('kit.noteBody')}
        value={body}
        disabled={busy}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (
            (e.ctrlKey || e.metaKey) &&
            e.key === 'Enter' &&
            !e.nativeEvent.isComposing
          ) {
            e.preventDefault();
            void save();
          }
        }}
        placeholder={t('kit.writeNote')}
        className="bg-bg2 text-fg1 placeholder:text-fg4 focus:ring-accent h-20 w-full rounded-md px-3 py-2 text-sm outline-none focus:ring-2"
      />
      {error && (
        <p role="alert" className="text-red text-sm">
          {t('kit.saveFailed')}
        </p>
      )}
      <div className="mt-2 flex justify-end gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => setEditing(null)}
          className="flex items-center gap-1.5"
        >
          <i className="bi-x-lg icon-sm" aria-hidden="true" />
          {t('kit.cancel')}
        </Button>
        <Button
          variant="primary"
          type="button"
          disabled={busy || !body.trim()}
          onClick={() => void save()}
          className="flex items-center gap-1.5"
        >
          <i className="bi-check2 icon-sm" aria-hidden="true" />
          {t('kit.save')}
        </Button>
      </div>
    </div>
  );
  return (
    <Card
      title={t('kit.notes')}
      icon="bi-journal-text"
      count={notes.length}
      actions={
        onAdd && (
          <Button
            type="button"
            disabled={editing !== null}
            onClick={() => start('')}
            className="flex items-center gap-1.5"
          >
            <i className="bi bi-plus-lg icon-sm" aria-hidden="true" />
            {t('kit.addNote')}
          </Button>
        )
      }
    >
      {editing === '' && editor}
      <div className="space-y-2">
        {[...notes]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((note) =>
            editing === note.id ? (
              <div key={note.id}>{editor}</div>
            ) : (
              <div key={note.id} className="bg-tertiary group rounded-lg p-4">
                <div className="text-fg4 mb-1 flex items-center justify-between gap-2 text-xs">
                  <span>
                    {formatDateTime(note.created_at)}
                    {(note.revision !== undefined
                      ? note.revision > 0
                      : note.updated_at &&
                        note.updated_at !== note.created_at) && (
                      <> · {t('kit.edited')}</>
                    )}
                  </span>
                  <span className="flex gap-2 opacity-60 group-focus-within:opacity-100 group-hover:opacity-100">
                    {onEdit && (
                      <Button
                        variant="icon"
                        type="button"
                        disabled={editing !== null}
                        aria-label={t('kit.editNote')}
                        onClick={() => start(note.id, note.body)}

                        title={t('kit.editNote')}
                      >
                        <i className="bi bi-pencil" aria-hidden="true" />
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        variant="icon"
                        type="button"
                        aria-label={t('kit.deleteNote')}
                        onClick={() => onDelete(note.id)}

                        title={t('kit.deleteNote')}
                      >
                        <i className="bi bi-trash" aria-hidden="true" />
                      </Button>
                    )}
                  </span>
                </div>
                <NoteBody body={note.body} />
              </div>
            )
          )}
      </div>
      {notes.length === 0 && editing !== '' && (
        <p className="text-muted text-sm">{t('kit.noNotes')}</p>
      )}
    </Card>
  );
}
