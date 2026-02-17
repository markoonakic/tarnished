import { useMemo } from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  perPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  currentPage,
  totalPages,
  perPage,
  totalItems,
  onPageChange,
}: PaginationProps) {
  // Calculate item range
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const endItem = Math.min(currentPage * perPage, totalItems);

  // Generate page numbers with ellipsis logic
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [];

    // Always show first page
    pages.push(1);

    if (currentPage <= 4) {
      // Near the start: 1, 2, 3, 4, 5, ..., last
      for (let i = 2; i <= 5; i++) {
        pages.push(i);
      }
      pages.push('ellipsis-end');
      pages.push(totalPages);
    } else if (currentPage >= totalPages - 3) {
      // Near the end: 1, ..., n-4, n-3, n-2, n-1, n
      pages.push('ellipsis-start');
      for (let i = totalPages - 4; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Middle: 1, ..., current-1, current, current+1, ..., last
      pages.push('ellipsis-start');
      for (let i = currentPage - 1; i <= currentPage + 1; i++) {
        pages.push(i);
      }
      pages.push('ellipsis-end');
      pages.push(totalPages);
    }

    return pages;
  }, [currentPage, totalPages]);

  // If only one page, show only item count
  const showPaginationControls = totalPages > 1;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full">
      {/* Item count display */}
      <div className="text-sm text-muted">
        Showing {startItem}-{endItem} of {totalItems} items
      </div>

      {/* Pagination controls */}
      {showPaginationControls && (
        <div className="flex items-center gap-1">
          {/* Previous button */}
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={`
              flex items-center justify-center w-8 h-8 rounded-lg
              transition-all duration-200 ease-in-out cursor-pointer
              ${currentPage === 1
                ? 'bg-bg2 text-muted opacity-50 cursor-not-allowed'
                : 'bg-bg2 text-fg1 hover:bg-bg3 focus:bg-bg3'
              }
            `}
            aria-label="Previous page"
          >
            <i className="bi-chevron-left icon-sm" />
          </button>

          {/* Page numbers */}
          {pageNumbers.map((page, index) => {
            if (page === 'ellipsis-start' || page === 'ellipsis-end') {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="w-8 h-8 flex items-center justify-center text-muted"
                >
                  ...
                </span>
              );
            }

            const isActive = page === currentPage;
            return (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                className={`
                  w-8 h-8 flex items-center justify-center rounded-lg
                  transition-all duration-200 ease-in-out cursor-pointer
                  ${isActive
                    ? 'bg-accent text-bg1'
                    : 'bg-bg2 text-fg1 hover:bg-bg3 focus:bg-bg3'
                  }
                `}
                aria-label={`Page ${page}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {page}
              </button>
            );
          })}

          {/* Next button */}
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={`
              flex items-center justify-center w-8 h-8 rounded-lg
              transition-all duration-200 ease-in-out cursor-pointer
              ${currentPage === totalPages
                ? 'bg-bg2 text-muted opacity-50 cursor-not-allowed'
                : 'bg-bg2 text-fg1 hover:bg-bg3 focus:bg-bg3'
              }
            `}
            aria-label="Next page"
          >
            <i className="bi-chevron-right icon-sm" />
          </button>
        </div>
      )}
    </div>
  );
}
