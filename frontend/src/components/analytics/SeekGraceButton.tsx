interface SeekGraceButtonProps {
  onSeekGrace: () => Promise<void>;
  loading: boolean;
}

export function SeekGraceButton({
  onSeekGrace,
  loading,
}: SeekGraceButtonProps) {
  return (
    <button
      onClick={onSeekGrace}
      disabled={loading}
      className="bg-accent text-bg0 hover:bg-accent-bright flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50"
    >
      <i className={`bi-sun icon-sm ${loading ? 'animate-pulse' : ''}`} />
      <span>{loading ? 'Seeking...' : 'Seek Grace'}</span>
    </button>
  );
}
