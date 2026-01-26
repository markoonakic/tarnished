import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getApplication, deleteApplication } from '../lib/applications';
import { deleteRound } from '../lib/rounds';
import type { Application, Round } from '../lib/types';
import RoundForm from '../components/RoundForm';
import RoundCard from '../components/RoundCard';
import DocumentSection from '../components/DocumentSection';
import Layout from '../components/Layout';
import EmptyState from '../components/EmptyState';

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRoundForm, setShowRoundForm] = useState(false);
  const [editingRound, setEditingRound] = useState<Round | null>(null);

  useEffect(() => {
    if (id) loadApplication();
  }, [id]);

  async function loadApplication() {
    setLoading(true);
    try {
      const data = await getApplication(id!);
      setApplication(data);
    } catch {
      setError('Failed to load application');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this application?')) return;
    try {
      await deleteApplication(id!);
      navigate('/applications');
    } catch {
      setError('Failed to delete application');
    }
  }

  function handleDocumentUpdate(updated: Application) {
    // Preserve existing rounds since document endpoints don't return them
    setApplication(prev => prev ? { ...updated, rounds: prev.rounds } : updated);
  }

  async function handleDeleteRound(roundId: string) {
    if (!confirm('Delete this round?')) return;
    try {
      await deleteRound(roundId);

      setApplication(prev => prev ? {
        ...prev,
        rounds: prev.rounds?.filter(r => r.id !== roundId) || []
      } : null);
    } catch {
      setError('Failed to delete round');
    }
  }

  async function handleRoundSaved(savedRound: Round) {
    setShowRoundForm(false);
    setEditingRound(null);

    setApplication(prev => {
      if (!prev) return null;

      const rounds = prev.rounds || [];
      const existingIndex = rounds.findIndex(r => r.id === savedRound.id);

      if (existingIndex >= 0) {
        const newRounds = [...rounds];
        newRounds[existingIndex] = savedRound;
        return { ...prev, rounds: newRounds };
      } else {
        return { ...prev, rounds: [...rounds, savedRound] };
      }
    });
  }

  async function handleMediaChange(roundId: string) {
    try {
      const updatedApplication = await getApplication(id!);

      setApplication(prev => {
        if (!prev) return updatedApplication;

        const updatedRound = updatedApplication.rounds?.find(r => r.id === roundId);
        if (!updatedRound) return prev;

        return {
          ...prev,
          rounds: prev.rounds?.map(r => r.id === roundId ? updatedRound : r) || []
        };
      });
    } catch {
      setError('Failed to refresh media');
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  }

  function formatDateTime(dateStr: string | null) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="text-muted">Loading...</div>
        </div>
      </Layout>
    );
  }

  if (!application) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="text-accent-red">Application not found</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link to="/applications" className="text-[#689d6a] hover:text-[#8ec07c] transition-colors duration-200">
            &larr; Back to Applications
          </Link>
        </div>

        {error && (
          <div className="bg-accent-red/20 border border-accent-red text-accent-red px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <div className="bg-secondary rounded-lg p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold text-primary mb-1">{application.company}</h1>
              <p className="text-xl text-secondary">{application.job_title}</p>
            </div>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold"
              style={{
                backgroundColor: `${application.status.color}20`,
                color: application.status.color,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: application.status.color }}
              />
              {application.status.name}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
            <div>
              <span className="text-muted">Applied:</span>
              <span className="text-primary ml-2">{formatDate(application.applied_at)}</span>
            </div>
            <div>
              <span className="text-muted">Updated:</span>
              <span className="text-primary ml-2">{formatDateTime(application.updated_at)}</span>
            </div>
          </div>

          {application.job_url && (
            <div className="mb-4">
              <a
                href={application.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#689d6a] hover:text-[#8ec07c] transition-colors duration-200 text-sm"
              >
                View Job Posting &rarr;
              </a>
            </div>
          )}

          {application.job_description && (
            <div className="mb-4">
              <h3 className="text-muted text-sm mb-2">Job Description</h3>
              <p className="text-primary whitespace-pre-wrap break-words">{application.job_description}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-tertiary">
            <Link
              to={`/applications/${id}/edit`}
              className="px-4 py-2 bg-[#3c3836] text-[#ebdbb2] rounded hover:bg-[#504945] hover:text-[#fbf1c7] transition-all duration-200"
            >
              Edit
            </Link>
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-[#3c3836] text-[#fb4934] rounded hover:bg-[#504945] transition-all duration-200"
            >
              Delete
            </button>
          </div>
        </div>

        <div className="mb-6">
          <DocumentSection
            application={application}
            onUpdate={handleDocumentUpdate}
          />
        </div>

        <div className="bg-secondary rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-primary">Interview Rounds</h2>
            <button
              onClick={() => setShowRoundForm(true)}
              className="px-4 py-2 bg-[#689d6a] text-[#282828] rounded font-medium hover:bg-[#8ec07c] transition-all duration-200"
            >
              Add Round
            </button>
          </div>

          {(showRoundForm || editingRound) && (
            <div className="mb-4">
              <RoundForm
                applicationId={id!}
                round={editingRound}
                onSave={handleRoundSaved}
                onCancel={() => {
                  setShowRoundForm(false);
                  setEditingRound(null);
                }}
              />
            </div>
          )}

          {application.rounds && application.rounds.length > 0 ? (
            <div className="space-y-4">
              {application.rounds.map((round) => (
                <RoundCard
                  key={round.id}
                  round={round}
                  onEdit={() => setEditingRound(round)}
                  onDelete={() => handleDeleteRound(round.id)}
                  onMediaChange={() => handleMediaChange(round.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              message="No interview rounds yet."
              icon="bi-calendar-x"
              action={{
                label: 'Add Round',
                onClick: () => setShowRoundForm(true),
              }}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}
