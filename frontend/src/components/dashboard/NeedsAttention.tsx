import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';

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
      <div className="bg-secondary rounded-lg p-6">
        <div className="mb-4 flex items-center gap-2">
          <i className={`bi ${icon} ${iconColor} icon-xl`}></i>
          <h3 className="text-fg1 text-lg font-semibold">{title}</h3>
        </div>
        <p className="text-fg4 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-secondary rounded-lg p-6">
      <div className="mb-4 flex items-center gap-2">
        <i className={`bi ${icon} ${iconColor} icon-xl`}></i>
        <h3 className="text-fg1 text-lg font-semibold">{title}</h3>
        <span className="bg-tertiary text-fg4 rounded-full px-2 py-1 text-xs">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(`/applications/${item.id}`)}
            className="bg-tertiary hover:bg-bg3 w-full cursor-pointer rounded-lg p-4 text-left transition-[translate,background-color] duration-200 ease-in-out will-change-transform hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-fg1 truncate font-medium">{item.company}</p>
                <p className="text-fg4 truncate text-sm">{item.job_title}</p>
              </div>
              <div className="text-fg4 text-xs whitespace-nowrap">
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
        const response = await api.get('/api/dashboard/needs-attention');
        setData(response.data);
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
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-secondary animate-pulse rounded-lg p-6">
            <div className="bg-tertiary mb-4 h-6 w-32 rounded"></div>
            <div className="space-y-2">
              <div className="bg-bg0 h-16 rounded"></div>
              <div className="bg-bg0 h-16 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-secondary rounded-lg p-6">
        <p className="text-red-bright">
          Failed to load items needing attention
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
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
        iconColor="text-red"
      />
      <AttentionSection
        title="Interviewing"
        items={data.interviewing}
        emptyMessage="No active interviews"
        icon="bi-chat-square-quote"
        iconColor="text-green"
      />
    </div>
  );
}
