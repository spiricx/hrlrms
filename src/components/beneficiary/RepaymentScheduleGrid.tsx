import { CheckCircle, AlertTriangle, Clock, MinusCircle } from 'lucide-react';
import { formatDate, formatCurrency, stripTime, EMI_TOLERANCE } from '@/lib/loanCalculations';
import type { ScheduleEntry } from '@/lib/loanCalculations';
import type { Tables } from '@/integrations/supabase/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Transaction = Tables<'transactions'>;

interface RepaymentScheduleGridProps {
  schedule: ScheduleEntry[];
  transactions: Transaction[];
}

type MonthStatus = 'paid' | 'paid-advance' | 'late-paid' | 'partial' | 'overdue' | 'upcoming' | 'current';

function getMonthStatus(
  entry: ScheduleEntry,
  monthTxns: Transaction[],
  now: Date,
  isCurrentMonth: boolean
): MonthStatus {
  const totalPaid = monthTxns.reduce((sum, t) => sum + Number(t.amount), 0);
  const todayDay = stripTime(now);
  const dueDay = stripTime(entry.dueDate);

  if (totalPaid >= entry.emi - EMI_TOLERANCE) {
    // Check if this is an advance payment (paid before due date and in the future)
    const isPaidInAdvance = dueDay > todayDay;
    if (isPaidInAdvance) return 'paid-advance';
    const anyLate = monthTxns.some((t) => stripTime(new Date(t.date_paid)) > dueDay);
    return anyLate ? 'late-paid' : 'paid';
  }

  if (totalPaid > 0 && totalPaid < entry.emi) {
    return 'partial';
  }

  if (isCurrentMonth) return 'current';

  // Overdue only if due date is STRICTLY before today (at day level)
  if (dueDay < todayDay) return 'overdue';

  return 'upcoming';
}

const statusStyles: Record<MonthStatus, string> = {
  paid: 'bg-success/15 border-success/30 text-success',
  'paid-advance': 'bg-success/20 border-success/40 text-success ring-2 ring-success/20',
  'late-paid': 'bg-success/10 border-success/20 text-success',
  partial: 'bg-warning/15 border-warning/30 text-warning',
  overdue: 'bg-destructive/10 border-destructive/30 text-destructive animate-pulse-border',
  upcoming: 'bg-secondary border-border text-muted-foreground',
  current: 'bg-primary/10 border-primary/40 text-primary ring-2 ring-primary/20',
};

const statusIcons: Record<MonthStatus, React.ReactNode> = {
  paid: <CheckCircle className="w-4 h-4" />,
  'paid-advance': <CheckCircle className="w-4 h-4" />,
  'late-paid': <CheckCircle className="w-4 h-4" />,
  partial: <MinusCircle className="w-4 h-4" />,
  overdue: <AlertTriangle className="w-4 h-4" />,
  upcoming: <Clock className="w-4 h-4 opacity-40" />,
  current: <Clock className="w-4 h-4" />,
};

const statusLabels: Record<MonthStatus, string> = {
  paid: 'Paid',
  'paid-advance': 'Paid in Advance',
  'late-paid': 'Paid (Late)',
  partial: 'Partial',
  overdue: 'Overdue',
  upcoming: 'Upcoming',
  current: 'Due Now',
};

export default function RepaymentScheduleGrid({
  schedule,
  transactions,
}: RepaymentScheduleGridProps) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Group transactions by month_for
  const txnsByMonth = new Map<number, Transaction[]>();
  transactions.forEach((t) => {
    const arr = txnsByMonth.get(t.month_for) || [];
    arr.push(t);
    txnsByMonth.set(t.month_for, arr);
  });

  return (
    <div className="bg-card rounded-xl shadow-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-bold font-display">Visual Repayment Schedule</h3>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-success/30 border border-success/40" /> Paid</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-success/40 border-2 border-success/50" /> Advance</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-warning/30 border border-warning/40" /> Partial</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-destructive/30 border border-destructive/40" /> Overdue</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-primary/20 border border-primary/40" /> Due Now</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-secondary border border-border" /> Upcoming</span>
        </div>
      </div>

      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-3">
          {schedule.map((entry) => {
            const monthTxns = txnsByMonth.get(entry.month) || [];
            const isCurrentMonth =
              entry.dueDate.getMonth() === currentMonth &&
              entry.dueDate.getFullYear() === currentYear;
            const status = getMonthStatus(entry, monthTxns, now, isCurrentMonth);
            const paidAmount = monthTxns.reduce((sum, t) => sum + Number(t.amount), 0);

            return (
              <Tooltip key={entry.month}>
                <TooltipTrigger asChild>
                  <div
                    className={`relative flex flex-col items-center justify-center p-3 rounded-lg border-2 cursor-default transition-all ${statusStyles[status]}`}
                  >
                    {statusIcons[status]}
                    <span className="text-xs font-bold mt-1">M{entry.month}</span>
                    {status === 'paid-advance' && (
                      <span className="absolute -top-1 -right-1 px-1 py-px rounded bg-success text-success-foreground text-[9px] font-bold">
                        ADV
                      </span>
                    )}
                    {status === 'late-paid' && (
                      <span className="absolute -top-1 -right-1 px-1 py-px rounded bg-warning text-warning-foreground text-[9px] font-bold">
                        LATE
                      </span>
                    )}
                    {status === 'overdue' && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-destructive animate-pulse-dot" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[220px]">
                  <p className="font-bold">{statusLabels[status]}</p>
                  <p>Due: {formatDate(entry.dueDate)}</p>
                  <p>Expected: {formatCurrency(entry.emi)}</p>
                  {paidAmount > 0 && <p>Paid: {formatCurrency(paidAmount)}</p>}
                  {paidAmount > 0 && paidAmount < entry.emi && paidAmount >= entry.emi - EMI_TOLERANCE && (
                    <p className="text-warning mt-1">Rounding shortfall: {formatCurrency(entry.emi - paidAmount)}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
