interface JobLeadCardSkeletonProps {
  count?: number;
}

// Skeleton loading component for JobLeadCard
export function JobLeadCardSkeleton({ count = 1 }: JobLeadCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="bg-bg1 animate-pulse rounded-lg p-4">
          {/* Header skeleton */}
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="bg-bg2 mb-2 h-5 w-3/4 rounded" />
              <div className="bg-bg2 h-4 w-1/2 rounded" />
            </div>
            <div className="bg-bg2 h-6 w-20 flex-shrink-0 rounded" />
          </div>

          {/* Details skeleton */}
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
            <div className="bg-bg2 h-4 w-24 rounded" />
            <div className="bg-bg2 h-4 w-20 rounded" />
          </div>

          {/* Footer skeleton */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="bg-bg2 h-5 w-16 rounded" />
              <div className="bg-bg2 h-3 w-20 rounded" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
