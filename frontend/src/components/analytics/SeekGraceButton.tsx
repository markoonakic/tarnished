interface SeekGraceButtonProps {
  onSeekGrace: () => Promise<void>;
  loading: boolean;
  disabled?: boolean;
  label?: string;
}

export function SeekGraceButton({
  onSeekGrace,
  loading,
  disabled = false,
  label = 'Seek Grace',
}: SeekGraceButtonProps) {
  if (loading)
    return (
      <p role="status" className="text-fg1 flex items-center gap-2 text-sm">
        <i
          className="bi-arrow-repeat icon-sm animate-spin"
          aria-hidden="true"
        />
        Seeking…
      </p>
    );
  return (
    <button
      onClick={onSeekGrace}
      disabled={disabled}
      className="bg-accent text-bg0 hover:bg-accent-bright flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50"
    >
      <i className="bi-sun icon-sm" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
