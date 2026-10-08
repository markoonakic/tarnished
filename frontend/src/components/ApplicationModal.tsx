import { t } from '@/lib/i18n';
import { statusLabel } from '@/lib/referenceLabels';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { observeRead } from '../lib/queryClient';
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
import { statusOptionsWithCurrent } from '../lib/statusMeaning';

interface ApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (applicationId: string) => void;
  application?: Application;
}

export default function ApplicationModal({
  isOpen,
  onClose,
  onSuccess,
  application,
}: ApplicationModalProps) {
  useTranslation();
  const isEditing = Boolean(application);
  const initializedFormKeyRef = useRef<string | null>(null);
  const [formApplication, setFormApplication] = useState(application);

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
  const [responseAction, setResponseAction] = useState('unchanged');
  const [responseDate, setResponseDate] = useState('');
  const [responseNote, setResponseNote] = useState('');

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
        setJobUrlError(t('Please enter a valid URL'));
      } else {
        setJobUrlError('');
      }
    }
  }

  useEffect(() => {
    async function loadStatuses() {
      try {
        const data = await listStatuses();
        setStatuses(data);
        setError((current) =>
          current === 'Failed to load statuses' ? '' : current
        );
      } catch (error) {
        setError(t('Failed to load statuses'));
        return { error };
      }
    }
    return observeRead(loadStatuses);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      initializedFormKeyRef.current = null;
      return;
    }

    const formKey = isEditing && application ? application.id : 'create';
    if (initializedFormKeyRef.current === formKey) {
      return;
    }

    setFormApplication(application);
    setError('');
    setJobUrlError('');
    setResponseAction('unchanged');
    setResponseDate(application?.response_occurred_on ?? '');
    setResponseNote(application?.response_reference ?? '');

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

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!company.trim() || !jobTitle.trim() || !statusId) {
      setError(t('Please fill in required fields'));
      return;
    }

    const normalizedUrl = normalizeApplicationUrl(jobUrl);
    if (normalizedUrl && !isValidApplicationUrl(normalizedUrl)) {
      setJobUrlError(t('Please enter a valid URL'));
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

      if (isEditing && formApplication) {
        const data: ApplicationUpdate = buildUpdateApplicationPayload(values);
        data.expected_revision = formApplication.evidence_revision;
        if (responseAction === 'record')
          data.response_evidence = {
            occurred_on: responseDate || null,
            reference: responseNote || null,
          };
        if (responseAction === 'clear') data.response_evidence = null;
        await updateApplication(formApplication.id, data);
        onSuccess(formApplication.id);
        onClose();
      } else {
        const data: ApplicationCreate = buildCreateApplicationPayload(values);
        if (responseAction === 'record')
          data.response_evidence = {
            occurred_on: responseDate || null,
            reference: responseNote || null,
          };
        const created = await createApplication(data);
        onSuccess(created.id);
        onClose();
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : t('Failed to save application')
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="modal-title" busy={loading}>
      <div
        className="bg-bg1 mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-tertiary flex flex-shrink-0 items-center justify-between border-b p-4">
          <h3 id="modal-title" className="text-primary font-medium">
            {isEditing ? t('Edit Application') : t('New Application')}
          </h3>
          <button
            onClick={onClose}
            disabled={loading}
            aria-label={t('Close modal')}
            className="text-fg1 hover:bg-bg2 hover:text-fg0 cursor-pointer rounded p-2 transition-all duration-200 ease-in-out"
          >
            <i className="bi bi-x-lg icon-xl" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <fieldset disabled={loading} className="space-y-4">
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
                  {t('Company')} <span className="text-red-bright">*</span>
                </label>
                <input
                  id="company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="job-title"
                  className="text-muted mb-1 block text-sm font-semibold"
                >
                  {t('Job Title')} <span className="text-red-bright">*</span>
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
                  {t('Status')} <span className="text-red-bright">*</span>
                </label>
                <Dropdown
                  id="application-status"
                  options={[
                    { value: '', label: t('Select status') },
                    ...statusOptionsWithCurrent(
                      statuses,
                      formApplication?.status
                    ).map((status) => ({
                      value: status.id,
                      label: !statuses.some((option) => option.id === status.id)
                        ? `${statusLabel(status)} (${t('Current')})`
                        : statusLabel(status),
                    })),
                  ]}
                  value={statusId}
                  onChange={(value) => setStatusId(value)}
                  placeholder={t('Select status')}
                  containerBackground="bg1"
                />
              </div>

              <fieldset className="space-y-2 sm:col-span-2">
                <label className="text-fg1 flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={
                      responseAction === 'record' ||
                      (responseAction === 'unchanged' &&
                        formApplication?.response_state === 'recorded')
                    }
                    onChange={(e) =>
                      setResponseAction(
                        e.target.checked
                          ? 'record'
                          : isEditing
                            ? 'clear'
                            : 'unchanged'
                      )
                    }
                  />
                  {t('Employer replied')}
                </label>
                <p className="text-muted text-xs">
                  {t('Include rejections, but not automatic receipts.')}
                </p>
                {(responseAction === 'record' ||
                  (responseAction === 'unchanged' &&
                    formApplication?.response_state === 'recorded')) && (
                  <>
                    <label className="block">
                      {t('Response date (optional)')}
                      <input
                        aria-label={t('Response date')}
                        type="date"
                        value={responseDate}
                        onChange={(e) => {
                          setResponseDate(e.target.value);
                          setResponseAction('record');
                        }}
                        className="bg-bg2 text-fg1 ml-2 rounded p-2"
                      />
                    </label>
                    <label className="block">
                      {t('Response note (optional)')}
                      <input
                        aria-label={t('Response note')}
                        maxLength={2000}
                        value={responseNote}
                        onChange={(e) => {
                          setResponseNote(e.target.value);
                          setResponseAction('record');
                        }}
                        className="bg-bg2 text-fg1 ml-2 rounded p-2"
                      />
                    </label>
                  </>
                )}
              </fieldset>

              <div>
                <label
                  htmlFor="applied-date"
                  className="text-muted mb-1 block text-sm font-semibold"
                >
                  {t('Applied Date')}
                </label>
                <input
                  aria-describedby="applied-date-help"
                  id="applied-date"
                  type="date"
                  required={isEditing}
                  value={appliedAt}
                  onChange={(e) => setAppliedAt(e.target.value)}
                  className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                />
              </div>

              {!isEditing && (
                <p
                  id="applied-date-help"
                  className="text-muted text-sm sm:col-span-2"
                >
                  {t(
                    'Leave the date blank to use today in your effective time zone.'
                  )}
                </p>
              )}
              <div className="sm:col-span-2">
                <label
                  htmlFor="job-url"
                  className="text-muted mb-1 block text-sm font-semibold"
                >
                  {t('Job URL')}
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
                  placeholder={t('example.com or https://...')}
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
                  {t('Min Salary')}
                </label>
                <input
                  id="salary-min"
                  type="number"
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  placeholder={t('e.g. 100000')}
                  step="1"
                  className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="salary-max"
                  className="text-muted mb-1 block text-sm font-semibold"
                >
                  {t('Max Salary')}
                </label>
                <input
                  id="salary-max"
                  type="number"
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value)}
                  placeholder={t('e.g. 150000')}
                  step="1"
                  className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="salary-currency"
                  className="text-muted mb-1 block text-sm font-semibold"
                >
                  {t('Currency')}
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
                  placeholder={t('Currency')}
                  containerBackground="bg1"
                  size="xs"
                />
              </div>
            </div>

            <div className="border-tertiary border-t pt-4">
              <h4 className="text-muted mb-3 text-sm font-semibold">
                {t('Recruiter (Optional)')}
              </h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="recruiter-name"
                    className="text-muted mb-1 block text-sm font-semibold"
                  >
                    {t('Recruiter Name')}
                  </label>
                  <input
                    id="recruiter-name"
                    type="text"
                    value={recruiterName}
                    onChange={(e) => setRecruiterName(e.target.value)}
                    placeholder={t('e.g. John Smith')}
                    className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="recruiter-title"
                    className="text-muted mb-1 block text-sm font-semibold"
                  >
                    {t('Recruiter Title')}
                  </label>
                  <input
                    id="recruiter-title"
                    type="text"
                    value={recruiterTitle}
                    onChange={(e) => setRecruiterTitle(e.target.value)}
                    placeholder={t('e.g. Senior Recruiter')}
                    className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="recruiter-linkedin"
                    className="text-muted mb-1 block text-sm font-semibold"
                  >
                    {t('LinkedIn URL')}
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
                {t('Requirements (Optional)')}
              </h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="requirements-must"
                    className="text-muted mb-1 block text-sm font-semibold"
                  >
                    {t('Must Have')}
                  </label>
                  <textarea
                    id="requirements-must"
                    value={requirementsMustHave}
                    onChange={(e) => setRequirementsMustHave(e.target.value)}
                    rows={3}
                    placeholder={t(
                      'One requirement per line\ne.g. React experience\n5+ years TypeScript'
                    )}
                    className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full resize-y rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="requirements-nice"
                    className="text-muted mb-1 block text-sm font-semibold"
                  >
                    {t('Nice to Have')}
                  </label>
                  <textarea
                    id="requirements-nice"
                    value={requirementsNiceToHave}
                    onChange={(e) => setRequirementsNiceToHave(e.target.value)}
                    rows={3}
                    placeholder={t(
                      'One requirement per line\ne.g. Docker experience\nAWS certification'
                    )}
                    className="bg-bg2 text-fg1 placeholder-muted focus:ring-accent-bright w-full resize-y rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="source"
                    className="text-muted mb-1 block text-sm font-semibold"
                  >
                    {t('Source')}
                  </label>
                  <input
                    id="source"
                    type="text"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder={t('e.g. LinkedIn, Indeed, Referral')}
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
                  {t('Job Description')}
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
                {t('Cancel')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50"
              >
                {loading
                  ? t('Saving...')
                  : isEditing
                    ? t('Save')
                    : t('Add Application')}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </Modal>
  );
}
