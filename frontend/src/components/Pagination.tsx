import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
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
  useTranslation();
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const endItem = Math.min(currentPage * perPage, totalItems);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [];

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

  const showPaginationControls = totalPages > 1;

  return (
    <div className="flex w-full flex-col items-center justify-between gap-4 sm:flex-row">
      <div className="text-muted text-sm">
        {t('pagination', { start: startItem, end: endItem, count: totalItems })}
      </div>

      {showPaginationControls && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-200 ease-in-out ${
              currentPage === 1
                ? 'bg-bg2 text-muted cursor-not-allowed opacity-50'
                : 'bg-bg2 text-fg1 hover:bg-bg3 focus:bg-bg3'
            } `}
            aria-label={t('Previous page')}
          >
            <i className="bi-chevron-left icon-sm" />
          </button>

          {pageNumbers.map((page, index) => {
            if (page === 'ellipsis-start' || page === 'ellipsis-end') {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="text-muted flex h-8 w-8 items-center justify-center"
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
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-200 ease-in-out ${
                  isActive
                    ? 'bg-accent text-bg1'
                    : 'bg-bg2 text-fg1 hover:bg-bg3 focus:bg-bg3'
                } `}
                aria-label={t('Page {{page}}', { page: page })}
                aria-current={isActive ? 'page' : undefined}
              >
                {page}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-200 ease-in-out ${
              currentPage === totalPages
                ? 'bg-bg2 text-muted cursor-not-allowed opacity-50'
                : 'bg-bg2 text-fg1 hover:bg-bg3 focus:bg-bg3'
            } `}
            aria-label={t('Next page')}
          >
            <i className="bi-chevron-right icon-sm" />
          </button>
        </div>
      )}
    </div>
  );
}
