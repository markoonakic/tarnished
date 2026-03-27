import { useEffect, useRef, useState } from 'react';
import { createApplication, updateApplication } from '../lib/applications';
import {
  buildCreateApplicationPayload,
  buildUpdateApplicationPayload,
  getApplicationModalDefaults,
  getApplicationModalValues,
  isValidApplicationUrl,
  normalizeApplicationUrl,
} from '../lib/applicationModalForm';
import { listStatuses } from '../lib/settings';
import type {
  Status,
  Application,
  ApplicationCreate,
  ApplicationUpdate,
} from '../lib/types';
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
  application,
}: ApplicationModalProps) {
  const isEditing = Boolean(application);
  const initializedFormKeyRef = useRef<string | null>(null);

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

  function applyFormValues(
    values: ReturnType<typeof getApplicationModalValues>
  ) {
    setCompany(values.company);
    setJobTitle(values.jobTitle);
    setJobDescription(values.jobDescription);
    setJobUrl(values.jobUrl);
    setStatusId(values.statusId);
    setAppliedAt(values.appliedAt);
    setSalaryMin(values.salaryMin);
    setSalaryMax(values.salaryMax);
    setSalaryCurrency(values.salaryCurrency);
    setRecruiterName(values.recruiterName);
    setRecruiterTitle(values.recruiterTitle);
    setRecruiterLinkedinUrl(values.recruiterLinkedinUrl);
    setRequirementsMustHave(values.requirementsMustHave);
    setRequirementsNiceToHave(values.requirementsNiceToHave);
    setSource(values.source);
  }

  function handleJobUrlBlur() {
    if (jobUrl) {
      const normalized = normalizeApplicationUrl(jobUrl);
      setJobUrl(normalized);
      if (!isValidApplicationUrl(normalized)) {
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
    if (!isOpen) {
      initializedFormKeyRef.current = null;
      return;
    }

    const formKey = isEditing && application ? application.id : 'create';
    if (initializedFormKeyRef.current === formKey) {
      return;
    }

    setError('');
    setJobUrlError('');

    if (isEditing && application) {
      applyFormValues(getApplicationModalValues(application));
    } else {
      applyFormValues(getApplicationModalDefaults(statuses));
    }

    initializedFormKeyRef.current = formKey;
  }, [isOpen, isEditing, application, statuses]);

  useEffect(() => {
    if (!isOpen || isEditing || statusId || statuses.length === 0) {
      return;
    }

    setStatusId(getApplicationModalDefaults(statuses).statusId);
  }, [isOpen, isEditing, statusId, statuses]);

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

    const normalizedUrl = normalizeApplicationUrl(jobUrl);
    if (normalizedUrl && !isValidApplicationUrl(normalizedUrl)) {
      setJobUrlError('Please enter a valid URL');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const values = {
        company,
        jobTitle,
        jobDescription,
        jobUrl: normalizedUrl,
        statusId,
        appliedAt,
        salaryMin,
        salaryMax,
        salaryCurrency,
        recruiterName,
        recruiterTitle,
        recruiterLinkedinUrl,
        requirementsMustHave,
        requirementsNiceToHave,
        source,
      };

      if (isEditing && application) {
        const data: ApplicationUpdate = buildUpdateApplicationPayload(values);
        await updateApplication(application.id, data);
        onSuccess(application.id);
        onClose();
      } else {
        const data: ApplicationCreate = buildCreateApplicationPayload(values);
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
      className="bg-bg0/80 fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose();
        }
      }}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="bg-bg1 mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-tertiary flex flex-shrink-0 items-center justify-between border-b p-4">
          <h3 id="modal-title" className="text-primary font-medium">
            {isEditing ? 'Edit Application' : 'New Application'}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-fg1 hover:bg-bg2 hover:text-fg0 cursor-pointer rounded p-2 transition-all duration-200 ease-in-out"
          >
            <i className="bi bi-x-lg icon-xl" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 space-y-4 overflow-y-auto p-6"
        >
          {error && (
            <div className="bg-red-bright/20 border-red-bright text-red-bright rounded border px-4 py-3">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="company"
                className="text-muted mb-1 block text-sm font-semibold"
              >
                Company <span className="text-red-bright">*</span>
              </label>
              <input
                id="company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                required
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="job-title"
                className="text-muted mb-1 block text-sm font-semibold"
              >
                Job Title <span className="text-red-bright">*</span>
              </label>
              <input
                id="job-title"
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                required
              />
            </div>

            <div>
              <label
                htmlFor="application-status"
                className="text-muted mb-1 block text-sm font-semibold"
              >
                Status <span className="text-red-bright">*</span>
              </label>
              <Dropdown
                id="application-status"
                options={[
                  { value: '', label: 'Select status' },
                  ...statuses.map((status) => ({
                    value: status.id,
                    label: status.name,
                  })),
                ]}
                value={statusId}
                onChange={(value) => setStatusId(value)}
                placeholder="Select status"
                containerBackground="bg1"
              />
            </div>

            <div>
              <label
                htmlFor="applied-date"
                className="text-muted mb-1 block text-sm font-semibold"
              >
                Applied Date
              </label>
              <input
                id="applied-date"
                type="date"
                value={appliedAt}
                onChange={(e) => setAppliedAt(e.target.value)}
                className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="job-url"
                className="text-muted mb-1 block text-sm font-semibold"
              >
                Job URL
              </label>
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
                className={`bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none ${
                  jobUrlError ? 'border-red-bright border' : ''
                }`}
              />
              {jobUrlError && (
                <p className="text-red-bright mt-1 text-sm">{jobUrlError}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="salary-min"
                className="text-muted mb-1 block text-sm font-semibold"
              >
                Min Salary (k)
              </label>
              <input
                id="salary-min"
                type="number"
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
                placeholder="e.g. 100"
                className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="salary-max"
                className="text-muted mb-1 block text-sm font-semibold"
              >
                Max Salary (k)
              </label>
              <input
                id="salary-max"
                type="number"
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value)}
                placeholder="e.g. 150"
                className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="salary-currency"
                className="text-muted mb-1 block text-sm font-semibold"
              >
                Currency
              </label>
              <Dropdown
                id="salary-currency"
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

          <div className="border-tertiary border-t pt-4">
            <h4 className="text-muted mb-3 text-sm font-semibold">
              Recruiter (Optional)
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="recruiter-name"
                  className="text-muted mb-1 block text-sm font-semibold"
                >
                  Recruiter Name
                </label>
                <input
                  id="recruiter-name"
                  type="text"
                  value={recruiterName}
                  onChange={(e) => setRecruiterName(e.target.value)}
                  placeholder="e.g. John Smith"
                  className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="recruiter-title"
                  className="text-muted mb-1 block text-sm font-semibold"
                >
                  Recruiter Title
                </label>
                <input
                  id="recruiter-title"
                  type="text"
                  value={recruiterTitle}
                  onChange={(e) => setRecruiterTitle(e.target.value)}
                  placeholder="e.g. Senior Recruiter"
                  className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="recruiter-linkedin"
                  className="text-muted mb-1 block text-sm font-semibold"
                >
                  LinkedIn URL
                </label>
                <input
                  id="recruiter-linkedin"
                  type="text"
                  value={recruiterLinkedinUrl}
                  onChange={(e) => setRecruiterLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/..."
                  className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="border-tertiary border-t pt-4">
            <h4 className="text-muted mb-3 text-sm font-semibold">
              Requirements (Optional)
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="requirements-must"
                  className="text-muted mb-1 block text-sm font-semibold"
                >
                  Must Have
                </label>
                <textarea
                  id="requirements-must"
                  value={requirementsMustHave}
                  onChange={(e) => setRequirementsMustHave(e.target.value)}
                  rows={3}
                  placeholder="One requirement per line&#10;e.g. React experience&#10;5+ years TypeScript"
                  className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full resize-y rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="requirements-nice"
                  className="text-muted mb-1 block text-sm font-semibold"
                >
                  Nice to Have
                </label>
                <textarea
                  id="requirements-nice"
                  value={requirementsNiceToHave}
                  onChange={(e) => setRequirementsNiceToHave(e.target.value)}
                  rows={3}
                  placeholder="One requirement per line&#10;e.g. Docker experience&#10;AWS certification"
                  className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full resize-y rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="source"
                  className="text-muted mb-1 block text-sm font-semibold"
                >
                  Source
                </label>
                <input
                  id="source"
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. LinkedIn, Indeed, Referral"
                  className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label
                htmlFor="job-description"
                className="text-muted mb-1 block text-sm font-semibold"
              >
                Job Description
              </label>
              <textarea
                id="job-description"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={4}
                className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full resize-y rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />
            </div>
          </div>

          <div className="border-tertiary flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="text-fg1 hover:bg-bg2 hover:text-fg0 cursor-pointer rounded-md bg-transparent px-4 py-2 transition-all duration-200 ease-in-out disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50"
            >
              {loading ? 'Saving...' : isEditing ? 'Save' : 'Add Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
