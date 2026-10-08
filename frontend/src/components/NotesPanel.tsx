import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { locale } from '@/lib/i18n';
import Card from './Card';
export interface NoteItem {
  id: string;
  body: string;
  created_at: string;
  updated_at?: string;
}
export interface NotesPanelProps {
  notes: NoteItem[];
  onAdd?: (body: string) => void | Promise<void>;
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
  const [expanded, setExpanded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  function start(id: string, text = '') {
    setEditing(id);
    setBody(text);
    setError(false);
  }
  async function save() {
    if (busy || !body.trim() || editing === null) return;
    setBusy(true);
    setError(false);
    try {
      if (editing === '') await onAdd?.(body.trim());
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
        <button
          type="button"
          disabled={busy}
          onClick={() => setEditing(null)}
          className="text-fg1 hover:bg-bg2 focus:ring-accent cursor-pointer rounded px-3 py-1.5 text-sm focus:ring-2"
        >
          {t('kit.cancel')}
        </button>
        <button
          type="button"
          disabled={busy || !body.trim()}
          onClick={() => void save()}
          className="bg-accent text-bg0 hover:bg-accent-bright focus:ring-accent cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium focus:ring-2 disabled:opacity-50"
        >
          {t('kit.save')}
        </button>
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
          <button
            type="button"
            disabled={editing !== null}
            onClick={() => start('')}
            className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
          >
            <i className="bi bi-plus-lg icon-sm" aria-hidden="true" />
            {t('kit.addNote')}
          </button>
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
                    {new Date(note.created_at).toLocaleString(locale(), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                    {note.updated_at && note.updated_at !== note.created_at && (
                      <> · {t('kit.edited')}</>
                    )}
                  </span>
                  <span className="flex gap-2 opacity-60 group-focus-within:opacity-100 group-hover:opacity-100">
                    {onEdit && (
                      <button
                        type="button"
                        disabled={editing !== null}
                        aria-label={t('kit.editNote')}
                        onClick={() => start(note.id, note.body)}
                        className="focus:ring-accent cursor-pointer rounded focus:ring-2"
                      >
                        <i className="bi bi-pencil" aria-hidden="true" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        aria-label={t('kit.deleteNote')}
                        onClick={() => onDelete(note.id)}
                        className="hover:text-red focus:ring-accent cursor-pointer rounded focus:ring-2"
                      >
                        <i className="bi bi-trash" aria-hidden="true" />
                      </button>
                    )}
                  </span>
                </div>
                <p
                  className={
                    expanded.includes(note.id)
                      ? 'text-fg1 text-sm break-words whitespace-pre-wrap'
                      : 'text-fg1 line-clamp-6 text-sm break-words whitespace-pre-wrap'
                  }
                >
                  {note.body}
                </p>
                {(note.body.split('\n').length > 6 ||
                  note.body.length > 360) && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((ids) =>
                        ids.includes(note.id)
                          ? ids.filter((id) => id !== note.id)
                          : [...ids, note.id]
                      )
                    }
                    className="text-accent focus:ring-accent mt-2 cursor-pointer rounded text-xs focus:ring-2"
                  >
                    {t(
                      expanded.includes(note.id)
                        ? 'kit.showLess'
                        : 'kit.showMore'
                    )}
                  </button>
                )}
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
