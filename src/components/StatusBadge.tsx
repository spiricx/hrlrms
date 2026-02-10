import { cn } from '@/lib/utils';
import { LoanStatus } from '@/lib/loanCalculations';

const statusConfig: Record<LoanStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-success/10 text-success border-success/20' },
  completed: { label: 'Completed', className: 'bg-primary/10 text-primary border-primary/20' },
  defaulted: { label: 'Defaulted', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  pending: { label: 'Pending', className: 'bg-warning/10 text-warning border-warning/20' },
};

export default function StatusBadge({ status }: { status: LoanStatus }) {
  const config = statusConfig[status];
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border', config.className)}>
      {config.label}
    </span>
  );
}
