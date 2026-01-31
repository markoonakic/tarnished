import { useNavigate } from 'react-router-dom';

interface QuickActionButton {
  label: string;
  icon: string;
  onClick: () => void;
}

function QuickActionButton({ label, icon, onClick }: QuickActionButton) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 bg-secondary rounded-lg p-4 hover:-translate-y-0.5 transition-transform duration-200 ease-in-out text-left w-full"
    >
      <i className={`bi ${icon} text-aqua text-xl`}></i>
      <span className="text-fg1 font-medium">{label}</span>
    </button>
  );
}

export default function QuickActions() {
  const navigate = useNavigate();

  const actions: QuickActionButton[] = [
    {
      label: 'New Application',
      icon: 'bi-plus-lg',
      onClick: () => navigate('/applications/new'),
    },
    {
      label: 'View Analytics',
      icon: 'bi-graph-up',
      onClick: () => navigate('/analytics'),
    },
    {
      label: 'View Applications',
      icon: 'bi-list-ul',
      onClick: () => navigate('/applications'),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      {actions.map((action, index) => (
        <QuickActionButton
          key={index}
          label={action.label}
          icon={action.icon}
          onClick={action.onClick}
        />
      ))}
    </div>
  );
}
