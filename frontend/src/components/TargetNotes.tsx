import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryClient } from '@/lib/queryClient';
import NotesPanel from './NotesPanel';
import Loading from './Loading';
import { apiV030, type Note, type TargetType } from '@/lib/apiV030';
import { DeleteConfirm } from './companies/RecordModals';
import { allPages, failureMessage, actionClass } from './companies/addressBook';

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
  const key = ['notes', targetType, targetId];
  const query = useQuery(
    {
      queryKey: key,
      queryFn: () =>
        allPages((page) =>
          apiV030.notes({
            target_type: targetType,
            target_id: targetId,
            per_page: 100,
            page,
          })
        ),
    },
    queryClient
  );
  const refresh = () => client.invalidateQueries({ queryKey: key });
  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <p role="alert" className="text-red mb-6">
        {failureMessage(query.error)}{' '}
        <button className={actionClass} onClick={() => void query.refetch()}>
          {t('companies.reload')}
        </button>
      </p>
    );
  return (
    <>
      <NotesPanel
        notes={query.data}
        onAdd={async (body) => {
          await apiV030.createNote({ body, [targetType + '_id']: targetId });
          await refresh();
        }}
        onEdit={async (id, body) => {
          const note = query.data.find((note) => note.id === id)!;
          await apiV030.updateNote(id, {
            body,
            expected_revision: note.revision,
          });
          await refresh();
        }}
        onDelete={(id) =>
          setDeleting(query.data.find((note) => note.id === id) ?? null)
        }
      />
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
