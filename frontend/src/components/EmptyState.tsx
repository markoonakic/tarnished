interface Props {
  message: string;
  subMessage?: string;
  icon?: string; // Bootstrap Icon class (e.g., "bi-inbox")
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({
  message,
  subMessage,
  icon,
  action,
}: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center px-4 py-12 text-center"
      role="status"
      aria-label={message}
    >
      {icon && (
        <i className={`${icon} icon-2xl text-muted mb-4`} aria-hidden="true" />
      )}

      <p className="text-muted max-w-md text-sm leading-relaxed">{message}</p>

      {subMessage && (
        <p className="text-muted mt-2 max-w-md text-xs">{subMessage}</p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="bg-accent text-bg0 hover:bg-accent-bright mt-6 cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
