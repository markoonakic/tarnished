import Button from '@/components/ui/Button';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryClient } from '@/lib/queryClient';
import NotesPanel from './NotesPanel';
import Loading from './Loading';
import { apiV030, type Note, type TargetType } from '@/lib/apiV030';
import { DeleteConfirm } from './companies/RecordModals';
import { allPages, failureMessage } from './companies/addressBook';

export default function TargetNotes({
  targetType,
  targetId,
}: {
  targetType: TargetType;
  targetId: string;
}) {
  const { t } = useTranslation();
  const client = useQueryClient(queryClient);
  const [deleting, setDeleting] = useState<Note | null>(null);
  const [error, setError] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const revisions = useRef(new Map<string, number>());
  const key = ['notes', targetType, targetId];
  const query = useQuery(
    {
      queryKey: key,
      staleTime: Infinity,
      queryFn: async () => {
        const notes = await allPages((page) =>
          apiV030.notes({
            target_type: targetType,
            target_id: targetId,
            per_page: 100,
            page,
          })
        );
        for (const note of notes)
          if (!revisions.current.has(note.id))
            revisions.current.set(note.id, note.revision);
        return notes;
      },
    },
    queryClient
  );
  const refresh = () => client.invalidateQueries({ queryKey: key });
  async function save(action: () => Promise<Note>) {
    try {
      const saved = await action();
      revisions.current.set(saved.id, saved.revision);
      setError('');
      await refresh();
    } catch (error) {
      setError(failureMessage(error));
      throw error;
    }
  }
  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <p role="alert" className="text-red mb-6">
        {failureMessage(query.error)}{' '}
        <Button onClick={() => void query.refetch()}>
          <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
          {t('companies.reload')}
        </Button>
      </p>
    );
  return (
    <>
      <NotesPanel
        key={editorKey}
        notes={query.data.map((note) => ({
          ...note,
          updated_at: note.revision > 0 ? note.updated_at : note.created_at,
        }))}
        onAdd={(body, requestKey) =>
          save(() =>
            apiV030.createNote(
              { body, [targetType + '_id']: targetId },
              requestKey
            )
          )
        }
        onEdit={(id, body) =>
          save(() =>
            apiV030.updateNote(id, {
              body,
              expected_revision:
                revisions.current.get(id) ??
                query.data.find((note) => note.id === id)!.revision,
            })
          )
        }
        onDelete={(id) =>
          setDeleting(query.data.find((note) => note.id === id) ?? null)
        }
      />
      {error && (
        <p role="alert" className="text-red mb-6">
          {error}{' '}
          <Button
            onClick={async () => {
              revisions.current.clear();
              await query.refetch();
              setEditorKey((key) => key + 1);
              setError('');
            }}
          >
            <i className="bi-x-lg icon-sm" aria-hidden="true" />
            {t('companies.discardReload')}
          </Button>
        </p>
      )}
      {deleting && (
        <DeleteConfirm
          message={t('companies.deleteNote')}
          onClose={() => setDeleting(null)}
          onDelete={async () => {
            await apiV030.deleteNote(deleting.id, deleting.revision);
            await refresh();
          }}
        />
      )}
    </>
  );
}
