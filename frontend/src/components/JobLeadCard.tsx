import type { JobLead, JobLeadStatus } from '@/lib/types';

interface JobLeadCardProps {
  lead: JobLead;
  onClick: () => void;
  onRetry?: (id: string) => void;
}

interface JobLeadCardSkeletonProps {
  count?: number;
}

// Skeleton loading component for JobLeadCard
export function JobLeadCardSkeleton({ count = 1 }: JobLeadCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="bg-bg1 rounded-lg p-4 animate-pulse"
        >
          {/* Header skeleton */}
          <div className="flex justify-between items-start gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <div className="h-5 bg-bg2 rounded w-3/4 mb-2" />
              <div className="h-4 bg-bg2 rounded w-1/2" />
            </div>
            <div className="h-6 w-20 bg-bg2 rounded flex-shrink-0" />
          </div>

          {/* Details skeleton */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
            <div className="h-4 bg-bg2 rounded w-24" />
            <div className="h-4 bg-bg2 rounded w-20" />
          </div>

          {/* Footer skeleton */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-5 bg-bg2 rounded w-16" />
              <div className="h-3 bg-bg2 rounded w-20" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

// Status badge colors following design guidelines
function getStatusStyles(status: JobLeadStatus): { bg: string; text: string; dot: string } {
  switch (status) {
    case 'extracted':
      return { bg: 'bg-green-bright/20', text: 'text-green-bright', dot: 'bg-green-bright' };
    case 'failed':
      return { bg: 'bg-red-bright/20', text: 'text-red-bright', dot: 'bg-red-bright' };
    case 'pending':
    default:
      return { bg: 'bg-yellow/20', text: 'text-yellow', dot: 'bg-yellow' };
  }
}

// Source icon mapping
function getSourceIcon(source: string | null): string {
  if (!source) return 'bi-link-45deg';
  const sourceLower = source.toLowerCase();
  if (sourceLower.includes('linkedin')) return 'bi-linkedin';
  if (sourceLower.includes('indeed')) return 'bi-briefcase-fill';
  if (sourceLower.includes('glassdoor')) return 'bi-door-open-fill';
  if (sourceLower.includes('greenhouse')) return 'bi-building';
  if (sourceLower.includes('lever')) return 'bi-building';
  return 'bi-link-45deg';
}

function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null
): string | null {
  if (min === null && max === null) return null;

  const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency || '$';

  if (min !== null && max !== null) {
    return `${currencySymbol}${(min / 1000).toFixed(0)}k - ${currencySymbol}${(max / 1000).toFixed(0)}k`;
  } else if (min !== null) {
    return `${currencySymbol}${(min / 1000).toFixed(0)}k+`;
  } else if (max !== null) {
    return `Up to ${currencySymbol}${(max / 1000).toFixed(0)}k`;
  }
  return null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString();
}

export default function JobLeadCard({ lead, onClick, onRetry }: JobLeadCardProps) {
  const statusStyles = getStatusStyles(lead.status);
  const salaryDisplay = formatSalary(lead.salary_min, lead.salary_max, lead.salary_currency);
  const displayTitle = lead.title || 'Unknown Title';
  const displayCompany = lead.company || 'Unknown Company';

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRetry) {
      onRetry(lead.id);
    }
  };

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      tabIndex={0}
      role="button"
      className="bg-bg1 rounded-lg p-4 hover:-translate-y-0.5 will-change-transform transition-[translate,background-color] duration-200 ease-in-out hover:bg-bg2 cursor-pointer"
    >
      {/* Header: Title and Status Badge */}
      <div className="flex justify-between items-start gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-primary font-medium truncate">{displayTitle}</h3>
          <p className="text-sm text-secondary truncate">{displayCompany}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold flex-shrink-0 ${statusStyles.bg} ${statusStyles.text}`}
        >
          <span className={`w-2 h-2 rounded-full ${statusStyles.dot}`} />
          {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
        </span>
      </div>

      {/* Details Row: Location, Salary */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
        {lead.location && (
          <div className="flex items-center gap-1.5 text-sm text-muted">
            <i className="bi-geo-alt icon-xs" />
            <span className="truncate">{lead.location}</span>
          </div>
        )}
        {salaryDisplay && (
          <div className="flex items-center gap-1.5 text-sm text-muted">
            <i className="bi-currency-dollar icon-xs" />
            <span>{salaryDisplay}</span>
          </div>
        )}
      </div>

      {/* Footer: Source Badge, Date, Retry Button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Source Badge */}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg3 rounded text-xs text-secondary">
            <i className={`${getSourceIcon(lead.source)} icon-xs`} />
            <span className="truncate">{lead.source || 'Direct'}</span>
          </span>
          {/* Saved Date */}
          <span className="text-xs text-muted truncate">
            Saved {formatDate(lead.scraped_at)}
          </span>
        </div>

        {/* Retry Button for Failed Leads */}
        {lead.status === 'failed' && onRetry && (
          <button
            onClick={handleRetry}
            className="flex-shrink-0 px-2 py-1 text-xs font-medium text-red-bright hover:bg-red-bright/20 rounded transition-all duration-200 ease-in-out cursor-pointer"
          >
            <i className="bi-arrow-clockwise icon-xs mr-1" />
            Retry
          </button>
        )}
      </div>

      {/* Error Message for Failed Leads */}
      {lead.status === 'failed' && lead.error_message && (
        <div className="mt-2 text-xs text-red-bright/80 truncate">
          <i className="bi-exclamation-triangle icon-xs mr-1" />
          {lead.error_message}
        </div>
      )}
    </div>
  );
}
