import { useEffect, useState } from 'react';
import { getInterviewRoundsData, type CandidateProgress } from '@/lib/analytics';
import Loading from '@/components/Loading';
import EmptyState from '@/components/EmptyState';

interface CandidateProgressionProps {
  period?: string;
  roundType?: string;
}

const ITEMS_PER_PAGE = 50;

export default function CandidateProgression({
  period = 'all',
  roundType,
}: CandidateProgressionProps) {
  const [data, setData] = useState<CandidateProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadData();
  }, [period, roundType]);

  async function loadData() {
    try {
      setLoading(true);
      const result = await getInterviewRoundsData(period, roundType);
      setData(result.candidate_progress);
      setError('');
      setCurrentPage(1); // Reset to first page on new data
    } catch (err) {
      setError('Failed to load candidate progression data');
      console.error('Error loading candidate progression:', err);
    } finally {
      setLoading(false);
    }
  }

  // Pagination calculations
  const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedData = data.slice(startIndex, endIndex);

  // Get status badge color class
  function getStatusBadgeClass(status: string): string {
    const statusLower = status.toLowerCase();
    if (statusLower === 'passed' || statusLower === 'accepted' || statusLower === 'offer') {
      return 'bg-green text-bg0';
    }
    if (statusLower === 'failed' || statusLower === 'rejected') {
      return 'bg-red text-bg0';
    }
    if (statusLower === 'withdrew' || statusLower === 'withdrawn') {
      return 'bg-yellow text-bg0';
    }
    return 'bg-orange text-bg0'; // Pending or any other status
  }

  if (loading) {
    return <Loading message="Loading candidate progression..." size="sm" />;
  }

  if (error) {
    return <div className="text-center py-8 text-red">{error}</div>;
  }

  if (data.length === 0) {
    return (
      <EmptyState
        message="No candidates with interview data"
        subMessage="Add interview rounds to applications to see candidate progression"
        icon="bi-people"
      />
    );
  }

  return (
    <div className="bg-bg2 rounded-lg overflow-hidden">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-bg3">
            <tr>
              <th className="px-4 py-3 text-left text-fg1 text-sm font-semibold border-b border-tertiary">
                Candidate
              </th>
              <th className="px-4 py-3 text-left text-fg1 text-sm font-semibold border-b border-tertiary">
                Role
              </th>
              <th className="px-4 py-3 text-left text-fg1 text-sm font-semibold border-b border-tertiary">
                Rounds
              </th>
              <th className="px-4 py-3 text-left text-fg1 text-sm font-semibold border-b border-tertiary">
                Status
              </th>
              <th className="px-4 py-3 text-right text-fg1 text-sm font-semibold border-b border-tertiary">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((candidate) => (
              <tr
                key={candidate.application_id}
                className="border-b border-tertiary hover:bg-bg3 transition-all duration-200 ease-in-out"
              >
                <td className="px-4 py-3 text-fg0">{candidate.candidate_name}</td>
                <td className="px-4 py-3 text-fg1 text-sm">{candidate.role}</td>
                <td className="px-4 py-3 text-fg1 text-sm">{candidate.rounds_completed.length}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeClass(
                      candidate.current_status
                    )}`}
                  >
                    {candidate.current_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    className="bg-aqua text-bg0 px-3 py-1 rounded text-sm hover:bg-aqua-bright cursor-pointer transition-all duration-200 ease-in-out"
                    onClick={() => {
                      // Placeholder for view details action
                      console.log('View details for application:', candidate.application_id);
                    }}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="bg-bg3 px-4 py-3 flex items-center justify-between border-t border-tertiary">
          <div className="text-sm text-fg4">
            Showing {startIndex + 1} to {Math.min(endIndex, data.length)} of {data.length} candidates
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 rounded text-sm bg-aqua text-bg0 hover:bg-aqua-bright disabled:bg-bg4 disabled:cursor-not-allowed cursor-pointer transition-all duration-200 ease-in-out"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm text-fg1 flex items-center">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 rounded text-sm bg-aqua text-bg0 hover:bg-aqua-bright disabled:bg-bg4 disabled:cursor-not-allowed cursor-pointer transition-all duration-200 ease-in-out"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
