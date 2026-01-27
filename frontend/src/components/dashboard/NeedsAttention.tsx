import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface NeedsAttentionItem {
  id: string;
  company: string;
  job_title: string;
  days_since: number;
}

interface NeedsAttentionData {
  follow_ups: NeedsAttentionItem[];
  no_responses: NeedsAttentionItem[];
  interviewing: NeedsAttentionItem[];
}

interface AttentionSectionProps {
  title: string;
  items: NeedsAttentionItem[];
  emptyMessage: string;
  icon: string;
  iconColor: string;
}

function AttentionSection({
  title,
  items,
  emptyMessage,
  icon,
  iconColor,
}: AttentionSectionProps) {
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div className="bg-secondary rounded-lg p-6 border border-tertiary">
        <div className="flex items-center gap-2 mb-4">
          <i className={`bi ${icon} ${iconColor}`}></i>
          <h3 className="text-lg font-semibold text-fg1">{title}</h3>
        </div>
        <p className="text-fg4 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-secondary rounded-lg p-6 border border-tertiary">
      <div className="flex items-center gap-2 mb-4">
        <i className={`bi ${icon} ${iconColor}`}></i>
        <h3 className="text-lg font-semibold text-fg1">{title}</h3>
        <span className="text-xs bg-tertiary text-fg4 px-2 py-1 rounded-full">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(`/applications/${item.id}`)}
            className="w-full text-left bg-bg0 rounded-lg p-4 border border-tertiary hover:border-aqua hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-fg1 font-medium truncate">{item.company}</p>
                <p className="text-sm text-fg4 truncate">{item.job_title}</p>
              </div>
              <div className="text-xs text-fg4 whitespace-nowrap">
                {item.days_since}d
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function NeedsAttention() {
  const [data, setData] = useState<NeedsAttentionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchNeedsAttention() {
      try {
        const response = await fetch('/api/dashboard/needs-attention', {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch needs attention data');
        }

        const responseData = await response.json();
        setData(responseData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchNeedsAttention();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-secondary rounded-lg p-6 border border-tertiary animate-pulse">
            <div className="h-6 bg-tertiary rounded mb-4 w-32"></div>
            <div className="space-y-2">
              <div className="h-16 bg-bg0 rounded"></div>
              <div className="h-16 bg-bg0 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-secondary rounded-lg p-6 border border-tertiary">
        <p className="text-red">Failed to load items needing attention</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <AttentionSection
        title="Follow-ups"
        items={data.follow_ups}
        emptyMessage="No applications need follow-up"
        icon="bi-bell"
        iconColor="text-yellow"
      />
      <AttentionSection
        title="No Responses"
        items={data.no_responses}
        emptyMessage="No pending responses"
        icon="bi-clock-history"
        iconColor="text-orange"
      />
      <AttentionSection
        title="Interviewing"
        items={data.interviewing}
        emptyMessage="No active interviews"
        icon="bi-chat-square-quote"
        iconColor="text-aqua"
      />
    </div>
  );
}
