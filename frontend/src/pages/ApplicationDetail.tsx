import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getApplication, deleteApplication, uploadCV } from '../lib/applications';
import { deleteRound } from '../lib/rounds';
import type { Application, Round } from '../lib/types';
import RoundForm from '../components/RoundForm';
import RoundCard from '../components/RoundCard';
import Layout from '../components/Layout';

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

  async function handleCVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const updated = await uploadCV(id!, file);
      setApplication(updated);
    } catch {
      setError('Failed to upload CV');
    }
  }

  async function handleDeleteRound(roundId: string) {
    if (!confirm('Delete this round?')) return;
    try {
      await deleteRound(roundId);
      loadApplication();
    } catch {
      setError('Failed to delete round');
    }
  }

  function handleRoundSaved() {
    setShowRoundForm(false);
    setEditingRound(null);
    loadApplication();
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
          <Link to="/applications" className="text-accent-aqua hover:underline">
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
              className="px-3 py-1 rounded font-medium"
              style={{
                backgroundColor: `${application.status.color}20`,
                color: application.status.color,
              }}
            >
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
                className="text-accent-blue hover:underline text-sm"
              >
                View Job Posting &rarr;
              </a>
            </div>
          )}

          {application.job_description && (
            <div className="mb-4">
              <h3 className="text-muted text-sm mb-2">Job Description</h3>
              <p className="text-primary whitespace-pre-wrap">{application.job_description}</p>
            </div>
          )}

          <div className="flex items-center gap-4 pt-4 border-t border-tertiary">
            <div className="flex-1">
              {application.cv_path ? (
                <span className="text-accent-green text-sm">CV uploaded</span>
              ) : (
                <label className="cursor-pointer text-accent-aqua hover:underline text-sm">
                  Upload CV
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleCVUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            <Link
              to={`/applications/${id}/edit`}
              className="px-3 py-1 bg-accent-aqua text-bg-primary rounded text-sm hover:opacity-90"
            >
              Edit
            </Link>
            <button
              onClick={handleDelete}
              className="px-3 py-1 bg-accent-red text-bg-primary rounded text-sm hover:opacity-90"
            >
              Delete
            </button>
          </div>
        </div>

        <div className="bg-secondary rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-primary">Interview Rounds</h2>
            <button
              onClick={() => setShowRoundForm(true)}
              className="px-3 py-1 bg-accent-aqua text-bg-primary rounded text-sm hover:opacity-90"
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
                />
              ))}
            </div>
          ) : (
            <p className="text-muted text-center py-8">No interview rounds yet</p>
          )}
        </div>
      </div>
    </Layout>
  );
}
