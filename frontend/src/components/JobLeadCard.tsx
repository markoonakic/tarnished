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
