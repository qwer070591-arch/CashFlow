import { Check, LoaderCircle, TriangleAlert } from 'lucide-react';

export type Status = 'loading' | 'ready' | 'error';

export function StatusBadge({ status, labels }: { status: Status; labels: { loading: string; ready: string; error: string } }) {
  const Icon = status === 'loading' ? LoaderCircle : status === 'ready' ? Check : TriangleAlert;
  return <span className={`status-badge status-${status}`} role="status"><Icon size={14} className={status === 'loading' ? 'spin' : ''} aria-hidden="true" />{labels[status]}</span>;
}
