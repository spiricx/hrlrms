import { ExternalLink, CheckCircle, AlertTriangle, Clock, MinusCircle } from 'lucide-react';
import { formatCurrency, formatDate, stripTime } from '@/lib/loanCalculations';
import type { ScheduleEntry } from '@/lib/loanCalculations';
import type { Tables } from '@/integrations/supabase/types';

type Transaction = Tables<'transactions'>;

interface RepaymentHistoryTableProps {
  schedule: ScheduleEntry[];
  transactions: Transaction[];
  totalExpected: number;
  totalPaid: number;
  outstandingBalance: number;
}

type MonthStatus = 'paid' | 'late-paid' | 'partial' | 'overdue' | 'upcoming';

function getMonthStatus(
  entry: ScheduleEntry,
  monthTxns: Transaction[],
  now: Date
): MonthStatus {
  const totalPaidForMonth = monthTxns.reduce((sum, t) => sum + Number(t.amount), 0);
  const todayDay = stripTime(now);
  const dueDay = stripTime(entry.dueDate);

  if (totalPaidForMonth >= entry.emi) {
    const anyLate = monthTxns.some((t) => stripTime(new Date(t.date_paid)) > dueDay);
    return anyLate ? 'late-paid' : 'paid';
  }

  if (totalPaidForMonth > 0 && totalPaidForMonth < entry.emi) {
    return 'partial';
  }

  // Overdue only if today is STRICTLY after the due date (not on the due date itself)
  if (todayDay > dueDay) {
    return 'overdue';
  }

  return 'upcoming';
}

function StatusIndicator({ status }: { status: MonthStatus }) {
  switch (status) {
    case 'paid':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20">
          <CheckCircle className="w-3 h-3" /> Paid
        </span>
      );
    case 'late-paid':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20">
          <CheckCircle className="w-3 h-3" /> Paid
          <span className="ml-1 px-1 py-px rounded bg-warning/20 text-warning text-[10px]">Late</span>
        </span>
      );
    case 'partial':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-warning/10 text-warning border border-warning/20">
          <MinusCircle className="w-3 h-3" /> Partial
        </span>
      );
    case 'overdue':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20 animate-pulse-dot">
          <AlertTriangle className="w-3 h-3" /> Overdue
        </span>
      );
    case 'upcoming':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-secondary text-muted-foreground border border-border">
          <Clock className="w-3 h-3" /> Upcoming
        </span>
      );
  }
}

export default function RepaymentHistoryTable({
  schedule,
  transactions,
  totalExpected,
  totalPaid,
  outstandingBalance,
}: RepaymentHistoryTableProps) {
  const now = new Date();

  // Group transactions by month_for
  const txnsByMonth = new Map<number, Transaction[]>();
  transactions.forEach((t) => {
    const arr = txnsByMonth.get(t.month_for) || [];
    arr.push(t);
    txnsByMonth.set(t.month_for, arr);
  });

  return (
    <div className="bg-card rounded-xl shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Month</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Due Date</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expected</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount Paid</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">RRR</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Receipt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {schedule.map((entry) => {
              const monthTxns = txnsByMonth.get(entry.month) || [];
              const paidAmount = monthTxns.reduce((sum, t) => sum + Number(t.amount), 0);
              const status = getMonthStatus(entry, monthTxns, now);
              const latestTxn = monthTxns.length > 0 ? monthTxns[monthTxns.length - 1] : null;

              return (
                <tr
                  key={entry.month}
                  className={`transition-colors ${
                    status === 'overdue' ? 'bg-destructive/5 hover:bg-destructive/10' :
                    status === 'paid' || status === 'late-paid' ? 'hover:bg-success/5' :
                    'hover:bg-secondary/30'
                  }`}
                >
                  <td className="px-4 py-3 font-medium">Month {entry.month}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDate(entry.dueDate)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(entry.emi)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${
                    paidAmount >= entry.emi ? 'text-success' :
                    paidAmount > 0 ? 'text-warning' :
                    status === 'overdue' ? 'text-destructive' : 'text-muted-foreground'
                  }`}>
                    {paidAmount > 0 ? formatCurrency(paidAmount) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusIndicator status={status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {latestTxn ? formatDate(new Date(latestTxn.date_paid)) : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {latestTxn ? latestTxn.rrr_number : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {latestTxn?.receipt_url ? (
                      <a href={latestTxn.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline text-xs">
                        <ExternalLink className="w-3 h-3" /> Open
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Running Totals Footer */}
      <div className="border-t border-border bg-secondary/30 px-4 py-4 flex flex-wrap gap-6 text-sm">
        <div>
          <span className="text-muted-foreground">Total Expected: </span>
          <span className="font-bold">{formatCurrency(totalExpected)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Total Paid: </span>
          <span className="font-bold text-success">{formatCurrency(totalPaid)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Total Outstanding: </span>
          <span className={`font-bold ${outstandingBalance > 0 ? 'text-destructive' : 'text-success'}`}>
            {formatCurrency(outstandingBalance)}
          </span>
        </div>
      </div>
    </div>
  );
}
