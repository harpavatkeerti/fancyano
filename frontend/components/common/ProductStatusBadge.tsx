'use client';

interface ProductStatusBadgeProps {
  status: string;
  /** 'md' uses text-sm + px-3 py-1 (salesman page); 'sm' uses text-xs + px-2 py-1 (admin page). Default: 'sm' */
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  confirmed:   { label: 'Confirmed',    className: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'In Progress',  className: 'bg-amber-100 text-amber-800' },
  completed:   { label: 'Completed',    className: 'bg-green-100 text-green-800' },
  cancelled:   { label: '❌ Cancelled', className: 'bg-red-100 text-red-800' },
  exchanged:   { label: '🔄 Exchanged', className: 'bg-orange-100 text-orange-800' },
};

export function ProductStatusBadge({ status, size = 'sm' }: ProductStatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] || { label: status, className: 'bg-gray-100 text-gray-800' };
  const sizeClass = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-1 text-xs';
  return (
    <span className={`rounded-full font-semibold ${sizeClass} ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
