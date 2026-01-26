interface Props {
  message: string;
  subMessage?: string;
  icon?: string; // Bootstrap Icon class (e.g., "bi-inbox")
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({ message, subMessage, icon, action }: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 px-4 text-center"
      role="status"
      aria-label={message}
    >
      {icon && (
        <i className={`${icon} text-5xl text-muted mb-4`} aria-hidden="true" />
      )}

      <p className="text-sm text-muted leading-relaxed max-w-md">
        {message}
      </p>

      {subMessage && (
        <p className="text-xs text-muted mt-2 max-w-md">
          {subMessage}
        </p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 px-4 py-2 bg-accent-aqua text-bg-primary rounded font-medium hover:opacity-90 transition-opacity duration-200"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
