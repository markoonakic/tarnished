interface Props {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function Spinner({ size = 'md', className = '' }: Props) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-2',
  };

  return (
    <div
      className={`${sizes[size]} border-accent/30 border-t-accent animate-spin rounded-full ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
