interface SeekGraceButtonProps {
  onSeekGrace: () => Promise<void>;
  loading: boolean;
}

export function SeekGraceButton({ onSeekGrace, loading }: SeekGraceButtonProps) {
  return (
    <button
      onClick={onSeekGrace}
      disabled={loading}
      className="bg-accent text-bg0 hover:bg-accent-bright disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer flex items-center gap-2"
    >
      <i className={`bi-sun icon-sm ${loading ? 'animate-pulse' : ''}`} />
      <span>{loading ? 'Seeking...' : 'Seek Grace'}</span>
    </button>
  );
}
