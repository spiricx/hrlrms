import { Banknote, CalendarCheck, AlertTriangle, TrendingDown, Clock } from 'lucide-react';
import { formatCurrency, stripTime } from '@/lib/loanCalculations';
import type { ScheduleEntry } from '@/lib/loanCalculations';
import type { Tables } from '@/integrations/supabase/types';

type Transaction = Tables<'transactions'>;

interface RepaymentSummaryCardProps {
  totalPaid: number;
  outstandingBalance: number;
  totalExpected: number;
  tenorMonths: number;
  transactions: Transaction[];
  schedule: ScheduleEntry[];
}

export default function RepaymentSummaryCard({
  totalPaid,
  outstandingBalance,
  totalExpected,
  tenorMonths,
  transactions,
  schedule,
}: RepaymentSummaryCardProps) {
  const today = stripTime(new Date());

  // Count months fully paid (at least one transaction recorded for that month)
  const paidMonthSet = new Set(transactions.map((t) => t.month_for));
  const monthsPaid = paidMonthSet.size;

  // Find the earliest unpaid installment's due date
  const earliestUnpaidEntry = schedule.find((entry) => !paidMonthSet.has(entry.month));
  
  // Days overdue: difference between today and earliest unpaid due date (only if past due)
  let daysOverdue = 0;
  if (earliestUnpaidEntry) {
    const dueDay = stripTime(earliestUnpaidEntry.dueDate);
    if (today > dueDay) {
      daysOverdue = Math.floor((today.getTime() - dueDay.getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  // In Arrears: due date < today (strictly before, at day level), not paid
  const monthsInArrears = schedule.filter((entry) => {
    const dueDay = stripTime(entry.dueDate);
    return dueDay < today && !paidMonthSet.has(entry.month);
  }).length;

  const percentPaid = totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 100) : 0;

  return (
    <div className="bg-card rounded-xl shadow-card p-6">
      <h2 className="text-lg font-bold font-display mb-4">Loan Repayment Summary</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Total Repaid */}
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-success/10 text-success">
            <Banknote className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Repaid</p>
            <p className="text-xl font-bold text-success">{formatCurrency(totalPaid)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{percentPaid}% of total</p>
          </div>
        </div>

        {/* Months Paid */}
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Months Paid</p>
            <p className="text-xl font-bold">{monthsPaid} <span className="text-sm font-normal text-muted-foreground">of {tenorMonths}</span></p>
          </div>
        </div>

        {/* Days Overdue */}
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-lg ${daysOverdue > 0 ? (daysOverdue >= 90 ? 'bg-destructive/10 text-destructive' : daysOverdue >= 30 ? 'bg-orange-500/10 text-orange-500' : 'bg-warning/10 text-warning') : 'bg-secondary text-muted-foreground'}`}>
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Days Overdue</p>
            <p className={`text-xl font-bold ${daysOverdue >= 90 ? 'text-destructive' : daysOverdue >= 30 ? 'text-orange-500' : daysOverdue > 0 ? 'text-warning' : ''}`}>
              {daysOverdue}
              {daysOverdue >= 90 && <span className="inline-block ml-2 w-2 h-2 rounded-full bg-destructive animate-pulse-dot" />}
              {daysOverdue > 0 && daysOverdue < 90 && <span className="inline-block ml-2 w-2 h-2 rounded-full bg-warning animate-pulse-dot" />}
            </p>
          </div>
        </div>

        {/* Months in Arrears */}
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-lg ${monthsInArrears > 0 ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-muted-foreground'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Months in Arrears</p>
            <p className={`text-xl font-bold ${monthsInArrears > 0 ? 'text-destructive' : ''}`}>
              {monthsInArrears}
              {monthsInArrears > 0 && <span className="inline-block ml-2 w-2 h-2 rounded-full bg-destructive animate-pulse-dot" />}
            </p>
          </div>
        </div>

        {/* Current Balance */}
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-lg ${outstandingBalance > 0 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Current Balance</p>
            <p className={`text-xl font-bold ${outstandingBalance > 0 ? 'text-warning' : 'text-success'}`}>
              {formatCurrency(outstandingBalance)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
