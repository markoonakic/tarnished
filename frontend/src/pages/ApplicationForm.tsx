import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getApplication, createApplication, updateApplication } from '../lib/applications';
import { listStatuses } from '../lib/settings';
import type { Status, ApplicationCreate, ApplicationUpdate } from '../lib/types';
import Layout from '../components/Layout';

export default function ApplicationForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [jobUrlError, setJobUrlError] = useState('');
  const [statusId, setStatusId] = useState('');
  const [appliedAt, setAppliedAt] = useState('');

  function normalizeUrl(url: string): string {
    if (!url) return url;
    const trimmed = url.trim();
    if (trimmed && !trimmed.match(/^https?:\/\//i)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  }

  function isValidUrl(url: string): boolean {
    if (!url) return true;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  function handleJobUrlBlur() {
    if (jobUrl) {
      const normalized = normalizeUrl(jobUrl);
      setJobUrl(normalized);
      if (!isValidUrl(normalized)) {
        setJobUrlError('Please enter a valid URL');
      } else {
        setJobUrlError('');
      }
    }
  }

  useEffect(() => {
    loadStatuses();
    if (isEditing) {
      loadApplication();
    } else {
      setAppliedAt(new Date().toISOString().split('T')[0]);
      setLoading(false);
    }
  }, [id]);

  async function loadStatuses() {
    try {
      const data = await listStatuses();
      setStatuses(data);
      if (!isEditing && data.length > 0) {
        const defaultStatus = data.find((s) => s.is_default) || data[0];
        setStatusId(defaultStatus.id);
      }
    } catch {
      setError('Failed to load statuses');
    }
  }

  async function loadApplication() {
    try {
      const app = await getApplication(id!);
      setCompany(app.company);
      setJobTitle(app.job_title);
      setJobDescription(app.job_description || '');
      setJobUrl(app.job_url || '');
      setStatusId(app.status.id);
      setAppliedAt(app.applied_at.split('T')[0]);
    } catch {
      setError('Failed to load application');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!company || !jobTitle || !statusId) {
      setError('Please fill in required fields');
      return;
    }

    const normalizedUrl = normalizeUrl(jobUrl);
    if (normalizedUrl && !isValidUrl(normalizedUrl)) {
      setJobUrlError('Please enter a valid URL');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (isEditing) {
        const data: ApplicationUpdate = {
          company,
          job_title: jobTitle,
          job_description: jobDescription || null,
          job_url: normalizedUrl || null,
          status_id: statusId,
          applied_at: appliedAt,
        };
        await updateApplication(id!, data);
        navigate(`/applications/${id}`);
      } else {
        const data: ApplicationCreate = {
          company,
          job_title: jobTitle,
          job_description: jobDescription || undefined,
          job_url: normalizedUrl || undefined,
          status_id: statusId,
          applied_at: appliedAt,
        };
        const created = await createApplication(data);
        navigate(`/applications/${created.id}`);
      }
    } catch {
      setError('Failed to save application');
    } finally {
      setSaving(false);
    }
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

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            to={isEditing ? `/applications/${id}` : '/applications'}
            className="text-accent-aqua hover:underline"
          >
            &larr; Back
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-primary mb-6">
          {isEditing ? 'Edit Application' : 'New Application'}
        </h1>

        {error && (
          <div className="bg-accent-red/20 border border-accent-red text-accent-red px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-secondary rounded-lg p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-muted mb-1">
                Company <span className="text-accent-red">*</span>
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary focus:outline-none focus:border-accent-aqua"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-muted mb-1">
                Job Title <span className="text-accent-red">*</span>
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary focus:outline-none focus:border-accent-aqua"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-muted mb-1">
                Status <span className="text-accent-red">*</span>
              </label>
              <select
                value={statusId}
                onChange={(e) => setStatusId(e.target.value)}
                className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary focus:outline-none focus:border-accent-aqua"
                required
              >
                <option value="">Select status</option>
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-muted mb-1">Applied Date</label>
              <input
                type="date"
                value={appliedAt}
                onChange={(e) => setAppliedAt(e.target.value)}
                className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary focus:outline-none focus:border-accent-aqua"
              />
            </div>

            <div>
              <label className="block text-sm text-muted mb-1">Job URL</label>
              <input
                type="text"
                value={jobUrl}
                onChange={(e) => {
                  setJobUrl(e.target.value);
                  setJobUrlError('');
                }}
                onBlur={handleJobUrlBlur}
                placeholder="example.com or https://..."
                className={`w-full px-3 py-2 bg-tertiary border rounded text-primary placeholder-muted focus:outline-none focus:border-accent-aqua ${
                  jobUrlError ? 'border-accent-red' : 'border-muted'
                }`}
              />
              {jobUrlError && (
                <p className="text-accent-red text-sm mt-1">{jobUrlError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-muted mb-1">Job Description</label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary focus:outline-none focus:border-accent-aqua resize-y"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-tertiary">
            <Link
              to={isEditing ? `/applications/${id}` : '/applications'}
              className="px-4 py-2 bg-tertiary text-primary rounded hover:bg-muted disabled:opacity-50 transition-all duration-200"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-accent-aqua text-bg-primary rounded font-medium hover:opacity-90 disabled:opacity-50 transition-all duration-200"
            >
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Application'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
