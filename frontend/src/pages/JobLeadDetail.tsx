import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getJobLead, deleteJobLead, retryJobLead } from '../lib/jobLeads';
import type { JobLead } from '../lib/types';
import { useToastContext } from '../contexts/ToastContext';
import Layout from '../components/Layout';
import ConvertToApplicationModal from '../components/ConvertToApplicationModal';

export default function JobLeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToastContext();
  const [jobLead, setJobLead] = useState<JobLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConvertModal, setShowConvertModal] = useState(false);

  useEffect(() => {
    if (id) loadJobLead();
  }, [id]);

  async function loadJobLead() {
    setLoading(true);
    setError('');
    try {
      const data = await getJobLead(id!);
      setJobLead(data);
    } catch {
      const errorMsg = 'Failed to load job lead';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this job lead?')) return;
    try {
      await deleteJobLead(id!);
      toast.success('Job lead deleted');
      navigate('/job-leads');
    } catch {
      const errorMsg = 'Failed to delete job lead';
      setError(errorMsg);
      toast.error(errorMsg);
    }
  }

  async function handleRetry() {
    try {
      const updated = await retryJobLead(id!);
      setJobLead(updated);
      toast.success('Extraction retry initiated');
    } catch {
      const errorMsg = 'Failed to retry extraction';
      setError(errorMsg);
      toast.error(errorMsg);
    }
  }

  async function handleConverted(applicationId: string) {
    // Job lead is deleted after conversion, so navigate to the new application
    toast.success('Job lead converted to application');
    navigate(`/applications/${applicationId}`);
  }

  function formatDateTime(dateStr: string | null) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  }

  function getStatusBadge(status: JobLead['status']) {
    const colors = {
      pending: 'bg-yellow-bright/20 text-yellow-bright',
      extracted: 'bg-green-bright/20 text-green-bright',
      failed: 'bg-red-bright/20 text-red-bright',
    };
    return colors[status];
  }

  function getSourceBadge(source: string | null) {
    if (!source) return null;
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-bg2 text-fg1">
        <i className="bi-link-45deg icon-xs"></i>
        {source}
      </span>
    );
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

  if (!jobLead) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="text-red-bright">Job lead not found</div>
        </div>
      </Layout>
    );
  }

  const canConvert = jobLead.status === 'extracted' && !jobLead.converted_to_application_id;
  const isConverted = !!jobLead.converted_to_application_id;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link to="/job-leads" className="text-accent hover:text-accent-bright transition-all duration-200 ease-in-out cursor-pointer">
            &larr; Back to Job Leads
          </Link>
        </div>

        {error && (
          <div className="bg-red-bright/20 border border-red-bright text-red-bright px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <div className="bg-secondary rounded-lg p-6 mb-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-3 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-primary">{jobLead.company || 'Unknown Company'}</h1>
                {getSourceBadge(jobLead.source)}
              </div>
              <p className="text-xl text-secondary">{jobLead.title || 'Untitled Position'}</p>
              {jobLead.location && (
                <p className="text-muted text-sm mt-1 flex items-center gap-1">
                  <i className="bi-geo-alt icon-sm"></i>
                  {jobLead.location}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold ${getStatusBadge(jobLead.status)}`}
              >
                <span className="w-2 h-2 rounded-full bg-current" />
                {jobLead.status}
              </span>
              {isConverted && (
                <Link
                  to={`/applications/${jobLead.converted_to_application_id}`}
                  className="text-accent hover:text-accent-bright transition-all duration-200 ease-in-out text-sm cursor-pointer"
                >
                  View Application &rarr;
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-sm">
            <div>
              <span className="text-muted">Scraped:</span>
              <span className="text-primary ml-2">{formatDateTime(jobLead.scraped_at)}</span>
            </div>
            {jobLead.posted_date && (
              <div>
                <span className="text-muted">Posted:</span>
                <span className="text-primary ml-2">{formatDateTime(jobLead.posted_date)}</span>
              </div>
            )}
          </div>

          {jobLead.url && (
            <div className="mb-4">
              <a
                href={jobLead.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-bright transition-all duration-200 ease-in-out text-sm cursor-pointer"
              >
                Open Job Page &rarr;
              </a>
            </div>
          )}

          {jobLead.error_message && (
            <div className="mb-4 p-4 bg-red-bright/10 border border-red-bright/30 rounded-lg">
              <h3 className="text-red-bright text-sm mb-2 flex items-center gap-1.5">
                <i className="bi-exclamation-triangle icon-sm"></i>
                Extraction Error
              </h3>
              <p className="text-red-bright text-sm">{jobLead.error_message}</p>
            </div>
          )}

          {/* Salary Information */}
          {(jobLead.salary_min || jobLead.salary_max) && (
            <div className="mb-4 p-4 bg-bg2 rounded-lg">
              <h3 className="text-muted text-sm mb-2 flex items-center gap-1.5">
                <i className="bi-currency-dollar icon-sm"></i>
                Salary Range
              </h3>
              <p className="text-primary font-medium">
                {jobLead.salary_currency || 'USD'}{' '}
                {jobLead.salary_min?.toLocaleString() || '???'}
                {' - '}
                {jobLead.salary_max?.toLocaleString() || '???'}
              </p>
            </div>
          )}

          {/* Recruiter Information */}
          {(jobLead.recruiter_name || jobLead.recruiter_title || jobLead.recruiter_linkedin_url) && (
            <div className="mb-4 p-4 bg-bg2 rounded-lg">
              <h3 className="text-muted text-sm mb-2 flex items-center gap-1.5">
                <i className="bi-person icon-sm"></i>
                Recruiter
              </h3>
              <div className="space-y-1">
                {jobLead.recruiter_name && (
                  <p className="text-primary font-medium">{jobLead.recruiter_name}</p>
                )}
                {jobLead.recruiter_title && (
                  <p className="text-secondary text-sm">{jobLead.recruiter_title}</p>
                )}
                {jobLead.recruiter_linkedin_url && (
                  <a
                    href={jobLead.recruiter_linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent-bright transition-all duration-200 ease-in-out text-sm cursor-pointer flex items-center gap-1"
                  >
                    <i className="bi-linkedin icon-sm"></i>
                    LinkedIn Profile
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Requirements - Must Have */}
          {jobLead.requirements_must_have && jobLead.requirements_must_have.length > 0 && (
            <div className="mb-4 p-4 bg-bg2 rounded-lg">
              <h3 className="text-muted text-sm mb-2 flex items-center gap-1.5">
                <i className="bi-check-circle icon-sm"></i>
                Must-Have Requirements
              </h3>
              <ul className="list-disc list-inside text-primary space-y-1">
                {jobLead.requirements_must_have.map((req, index) => (
                  <li key={index} className="text-sm">{req}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Requirements - Nice to Have */}
          {jobLead.requirements_nice_to_have && jobLead.requirements_nice_to_have.length > 0 && (
            <div className="mb-4 p-4 bg-bg2 rounded-lg">
              <h3 className="text-muted text-sm mb-2 flex items-center gap-1.5">
                <i className="bi-star icon-sm"></i>
                Nice-to-Have Requirements
              </h3>
              <ul className="list-disc list-inside text-primary space-y-1">
                {jobLead.requirements_nice_to_have.map((req, index) => (
                  <li key={index} className="text-sm">{req}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Skills */}
          {jobLead.skills && jobLead.skills.length > 0 && (
            <div className="mb-4 p-4 bg-bg2 rounded-lg">
              <h3 className="text-muted text-sm mb-2 flex items-center gap-1.5">
                <i className="bi-lightning icon-sm"></i>
                Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {jobLead.skills.map((skill, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-bg3 text-fg1"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Experience Range */}
          {(jobLead.years_experience_min !== null || jobLead.years_experience_max !== null) && (
            <div className="mb-4 p-4 bg-bg2 rounded-lg">
              <h3 className="text-muted text-sm mb-2 flex items-center gap-1.5">
                <i className="bi-clock-history icon-sm"></i>
                Experience Required
              </h3>
              <p className="text-primary font-medium">
                {jobLead.years_experience_min ?? '?'}-{jobLead.years_experience_max ?? '?'} years
              </p>
            </div>
          )}

          {/* Full Description */}
          {jobLead.description && (
            <div className="mb-4 p-4 bg-bg2 rounded-lg">
              <h3 className="text-muted text-sm mb-2 flex items-center gap-1.5">
                <i className="bi-file-text icon-sm"></i>
                Description
              </h3>
              <div className="text-primary whitespace-pre-wrap break-words text-sm">
                {jobLead.description}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-tertiary">
            {canConvert && (
              <button
                onClick={() => setShowConvertModal(true)}
                className="bg-aqua text-bg0 hover:bg-aqua-bright transition-all duration-200 ease-in-out px-3 py-1.5 rounded flex items-center gap-1.5 text-sm cursor-pointer"
              >
                <i className="bi-arrow-repeat icon-sm"></i>
                Convert to Application
              </button>
            )}
            {jobLead.status === 'failed' && (
              <button
                onClick={handleRetry}
                className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-3 py-1.5 rounded flex items-center gap-1.5 text-sm cursor-pointer"
              >
                <i className="bi-arrow-clockwise icon-sm"></i>
                Retry Extraction
              </button>
            )}
            <button
              onClick={handleDelete}
              className="bg-transparent text-red hover:bg-bg2 hover:text-red-bright transition-all duration-200 ease-in-out px-3 py-1.5 rounded flex items-center gap-1.5 text-sm cursor-pointer"
            >
              <i className="bi-trash icon-sm"></i>
              Delete
            </button>
          </div>
        </div>
      </div>
      {jobLead && (
        <ConvertToApplicationModal
          isOpen={showConvertModal}
          onClose={() => setShowConvertModal(false)}
          lead={jobLead}
          onConverted={handleConverted}
        />
      )}
    </Layout>
  );
}
