import { getStatusColor } from '../../utils/formatters';

interface StatusBadgeProps {
  status: string;
  small?: boolean;
}

export function StatusBadge({ status, small }: StatusBadgeProps) {
  const baseClass = getStatusColor(status);
  const sizeClass = small ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-xs font-semibold';
  return (
    <span className={`inline-flex items-center rounded-full shadow-sm ${baseClass} ${sizeClass}`}>
      {status || '—'}
    </span>
  );
}
