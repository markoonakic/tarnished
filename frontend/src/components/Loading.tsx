import Spinner from './Spinner';

interface Props {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function Loading({
  message = 'Loading...',
  size = 'md',
}: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12"
      role="status"
      aria-live="polite"
    >
      <Spinner size={size} />
      <span className="text-fg1 mt-2 text-sm">{message}</span>
    </div>
  );
}
