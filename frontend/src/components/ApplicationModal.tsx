import { useState, useEffect } from 'react';
import { createApplication, updateApplication } from '../lib/applications';
import { listStatuses } from '../lib/settings';
import type { Status, Application, ApplicationCreate, ApplicationUpdate } from '../lib/types';
import Dropdown from './Dropdown';

interface ApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (applicationId: string) => void;
  application?: Application; // undefined = create, defined = edit
}

export default function ApplicationModal({
  isOpen,
  onClose,
  onSuccess,
  application
}: ApplicationModalProps) {
  const isEditing = Boolean(application);

  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [jobUrlError, setJobUrlError] = useState('');
  const [statusId, setStatusId] = useState('');
  const [appliedAt, setAppliedAt] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('USD');
  const [recruiterName, setRecruiterName] = useState('');
  const [recruiterTitle, setRecruiterTitle] = useState('');
  const [recruiterLinkedinUrl, setRecruiterLinkedinUrl] = useState('');
  const [requirementsMustHave, setRequirementsMustHave] = useState('');
  const [requirementsNiceToHave, setRequirementsNiceToHave] = useState('');
  const [source, setSource] = useState('');

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

  // Load statuses on mount
  useEffect(() => {
    async function loadStatuses() {
      try {
        const data = await listStatuses();
        setStatuses(data);
      } catch {
        setError('Failed to load statuses');
      }
    }
    loadStatuses();
  }, []);

  // Reset/populate form when modal opens
  useEffect(() => {
    if (isOpen) {
      setError('');
      setJobUrlError('');

      if (isEditing && application) {
        setCompany(application.company);
        setJobTitle(application.job_title);
        setJobDescription(application.job_description || '');
        setJobUrl(application.job_url || '');
        setStatusId(application.status.id);
        setAppliedAt(application.applied_at.split('T')[0]);
        setSalaryMin(application.salary_min !== null ? String(application.salary_min / 1000) : '');
        setSalaryMax(application.salary_max !== null ? String(application.salary_max / 1000) : '');
        setSalaryCurrency(application.salary_currency || 'USD');
        setRecruiterName(application.recruiter_name || '');
        setRecruiterTitle(application.recruiter_title || '');
        setRecruiterLinkedinUrl(application.recruiter_linkedin_url || '');
        setRequirementsMustHave(application.requirements_must_have?.join('\n') || '');
        setRequirementsNiceToHave(application.requirements_nice_to_have?.join('\n') || '');
        setSource(application.source || '');
      } else {
        // Create mode - set defaults
        setCompany('');
        setJobTitle('');
        setJobDescription('');
        setJobUrl('');
        setSalaryMin('');
        setSalaryMax('');
        setSalaryCurrency('USD');
        setRecruiterName('');
        setRecruiterTitle('');
        setRecruiterLinkedinUrl('');
        setRequirementsMustHave('');
        setRequirementsNiceToHave('');
        setSource('');
        setAppliedAt(new Date().toISOString().split('T')[0]);
        // Set default status after statuses are loaded
        if (statuses.length > 0) {
          const defaultStatus = statuses.find((s) => s.is_default) || statuses[0];
          setStatusId(defaultStatus.id);
        }
      }
    }
  }, [isOpen, isEditing, application, statuses]);

  // Escape key handler
  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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

    setLoading(true);
    setError('');

    try {
      const salaryMinNum = salaryMin ? parseInt(salaryMin, 10) * 1000 : null;
      const salaryMaxNum = salaryMax ? parseInt(salaryMax, 10) * 1000 : null;
      const requirementsMustHaveArray = requirementsMustHave.trim()
        ? requirementsMustHave.split('\n').map(s => s.trim()).filter(Boolean)
        : null;
      const requirementsNiceToHaveArray = requirementsNiceToHave.trim()
        ? requirementsNiceToHave.split('\n').map(s => s.trim()).filter(Boolean)
        : null;

      if (isEditing && application) {
        const data: ApplicationUpdate = {
          company,
          job_title: jobTitle,
          job_description: jobDescription || null,
          job_url: normalizedUrl || null,
          status_id: statusId,
          applied_at: appliedAt,
          salary_min: salaryMinNum,
          salary_max: salaryMaxNum,
          salary_currency: salaryCurrency || null,
          recruiter_name: recruiterName || null,
          recruiter_title: recruiterTitle || null,
          recruiter_linkedin_url: recruiterLinkedinUrl || null,
          requirements_must_have: requirementsMustHaveArray,
          requirements_nice_to_have: requirementsNiceToHaveArray,
          source: source || null,
        };
        await updateApplication(application.id, data);
        onSuccess(application.id);
        onClose();
      } else {
        const data: ApplicationCreate = {
          company,
          job_title: jobTitle,
          job_description: jobDescription || undefined,
          job_url: normalizedUrl || undefined,
          status_id: statusId,
          applied_at: appliedAt,
          salary_min: salaryMinNum ?? undefined,
          salary_max: salaryMaxNum ?? undefined,
          salary_currency: salaryCurrency,
          recruiter_name: recruiterName || undefined,
          recruiter_title: recruiterTitle || undefined,
          recruiter_linkedin_url: recruiterLinkedinUrl || undefined,
          requirements_must_have: requirementsMustHaveArray ?? undefined,
          requirements_nice_to_have: requirementsNiceToHaveArray ?? undefined,
          source: source || undefined,
        };
        const created = await createApplication(data);
        onSuccess(created.id);
        onClose();
      }
    } catch {
      setError('Failed to save application');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-bg0/80 flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="bg-bg1 rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-tertiary">
          <h3 id="modal-title" className="text-primary font-medium">
            {isEditing ? 'Edit Application' : 'New Application'}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out p-2 rounded cursor-pointer"
          >
            <i className="bi bi-x-lg icon-xl" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-4">
          {error && (
            <div className="bg-red-bright/20 border border-red-bright text-red-bright px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="company" className="block mb-1 text-sm font-semibold text-muted">
                Company <span className="text-red-bright">*</span>
              </label>
              <input
                id="company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-3 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="job-title" className="block mb-1 text-sm font-semibold text-muted">
                Job Title <span className="text-red-bright">*</span>
              </label>
              <input
                id="job-title"
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full px-3 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
                required
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-semibold text-muted">
                Status <span className="text-red-bright">*</span>
              </label>
              <Dropdown
                options={[
                  { value: '', label: 'Select status' },
                  ...statuses.map((status) => ({ value: status.id, label: status.name }))
                ]}
                value={statusId}
                onChange={(value) => setStatusId(value)}
                placeholder="Select status"
                containerBackground="bg1"
              />
            </div>

            <div>
              <label htmlFor="applied-date" className="block mb-1 text-sm font-semibold text-muted">Applied Date</label>
              <input
                id="applied-date"
                type="date"
                value={appliedAt}
                onChange={(e) => setAppliedAt(e.target.value)}
                className="w-full px-3 py-2 bg-bg2 rounded text-fg1 focus:outline-none focus:ring-1 focus:ring-accent-bright transition-all duration-200 ease-in-out"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="job-url" className="block mb-1 text-sm font-semibold text-muted">Job URL</label>
              <input
                id="job-url"
                type="text"
                value={jobUrl}
                onChange={(e) => {
                  setJobUrl(e.target.value);
                  setJobUrlError('');
                }}
                onBlur={handleJobUrlBlur}
                placeholder="example.com or https://..."
                className={`w-full px-3 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded ${
                  jobUrlError ? 'border border-red-bright' : ''
                }`}
              />
              {jobUrlError && (
                <p className="text-red-bright text-sm mt-1">{jobUrlError}</p>
              )}
            </div>

            <div>
              <label htmlFor="salary-min" className="block mb-1 text-sm font-semibold text-muted">Min Salary (k)</label>
              <input
                id="salary-min"
                type="number"
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
                placeholder="e.g. 100"
                className="w-full px-3 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
              />
            </div>

            <div>
              <label htmlFor="salary-max" className="block mb-1 text-sm font-semibold text-muted">Max Salary (k)</label>
              <input
                id="salary-max"
                type="number"
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value)}
                placeholder="e.g. 150"
                className="w-full px-3 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-semibold text-muted">Currency</label>
              <Dropdown
                options={[
                  { value: 'USD', label: 'USD' },
                  { value: 'EUR', label: 'EUR' },
                  { value: 'GBP', label: 'GBP' },
                  { value: 'CAD', label: 'CAD' },
                  { value: 'AUD', label: 'AUD' },
                ]}
                value={salaryCurrency}
                onChange={(value) => setSalaryCurrency(value)}
                placeholder="Currency"
                containerBackground="bg1"
                size="xs"
              />
            </div>
          </div>

          <div className="border-t border-tertiary pt-4">
            <h4 className="text-sm font-semibold text-muted mb-3">Recruiter (Optional)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="recruiter-name" className="block mb-1 text-sm font-semibold text-muted">Recruiter Name</label>
                <input
                  id="recruiter-name"
                  type="text"
                  value={recruiterName}
                  onChange={(e) => setRecruiterName(e.target.value)}
                  placeholder="e.g. John Smith"
                  className="w-full px-3 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
                />
              </div>

              <div>
                <label htmlFor="recruiter-title" className="block mb-1 text-sm font-semibold text-muted">Recruiter Title</label>
                <input
                  id="recruiter-title"
                  type="text"
                  value={recruiterTitle}
                  onChange={(e) => setRecruiterTitle(e.target.value)}
                  placeholder="e.g. Senior Recruiter"
                  className="w-full px-3 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="recruiter-linkedin" className="block mb-1 text-sm font-semibold text-muted">LinkedIn URL</label>
                <input
                  id="recruiter-linkedin"
                  type="text"
                  value={recruiterLinkedinUrl}
                  onChange={(e) => setRecruiterLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/..."
                  className="w-full px-3 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-tertiary pt-4">
            <h4 className="text-sm font-semibold text-muted mb-3">Requirements (Optional)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="requirements-must" className="block mb-1 text-sm font-semibold text-muted">Must Have</label>
                <textarea
                  id="requirements-must"
                  value={requirementsMustHave}
                  onChange={(e) => setRequirementsMustHave(e.target.value)}
                  rows={3}
                  placeholder="One requirement per line&#10;e.g. React experience&#10;5+ years TypeScript"
                  className="w-full px-3 py-2 bg-bg2 rounded text-fg1 placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent-bright transition-all duration-200 ease-in-out resize-y"
                />
              </div>

              <div>
                <label htmlFor="requirements-nice" className="block mb-1 text-sm font-semibold text-muted">Nice to Have</label>
                <textarea
                  id="requirements-nice"
                  value={requirementsNiceToHave}
                  onChange={(e) => setRequirementsNiceToHave(e.target.value)}
                  rows={3}
                  placeholder="One requirement per line&#10;e.g. Docker experience&#10;AWS certification"
                  className="w-full px-3 py-2 bg-bg2 rounded text-fg1 placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent-bright transition-all duration-200 ease-in-out resize-y"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="source" className="block mb-1 text-sm font-semibold text-muted">Source</label>
                <input
                  id="source"
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. LinkedIn, Indeed, Referral"
                  className="w-full px-3 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="job-description" className="block mb-1 text-sm font-semibold text-muted">Job Description</label>
              <textarea
                id="job-description"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-bg2 rounded text-fg1 placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent-bright transition-all duration-200 ease-in-out resize-y"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-tertiary">
            <button
              type="button"
              onClick={onClose}
              className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-4 py-2 rounded-md disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Saving...' : isEditing ? 'Save' : 'Add Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
