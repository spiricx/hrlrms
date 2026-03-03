import { Banknote, CalendarCheck, AlertTriangle, TrendingDown, Clock, CalendarClock } from 'lucide-react';
import { formatCurrency } from '@/lib/loanCalculations';

interface RepaymentSummaryCardProps {
  totalPaid: number;
  outstandingBalance: number;
  totalExpected: number;
  tenorMonths: number;
  /** Authoritative metrics from v_loan_arrears DB view */
  daysOverdue: number;
  /** Total unpaid installments that have passed their due date */
  monthsOverdue: number;
  /** Months that have fully "aged" past their next due date — floor(DPD / 30.44) */
  monthsInArrears: number;
  monthsPaid: number;
}

export default function RepaymentSummaryCard({
  totalPaid,
  outstandingBalance,
  totalExpected,
  tenorMonths,
  daysOverdue,
  monthsOverdue,
  monthsInArrears,
  monthsPaid,
}: RepaymentSummaryCardProps) {
  const percentPaid = totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 100) : 0;
  const displayBalance = Math.max(0, outstandingBalance);
  const displayPercent = Math.min(100, percentPaid);

  return (
    <div className="bg-card rounded-xl shadow-card p-6">
      <h2 className="text-lg font-bold font-display mb-4">Loan Repayment Summary</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {/* Total Repaid */}
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-success/10 text-success">
            <Banknote className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Repaid</p>
            <p className="text-xl font-bold text-success">{formatCurrency(totalPaid)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{displayPercent}% of total</p>
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
          <div className={`p-2.5 rounded-lg ${daysOverdue > 0 ? (daysOverdue >= 90 ? 'bg-destructive/10 text-destructive' : daysOverdue >= 30 ? 'bg-orange-500/10 text-orange-500' : 'bg-destructive/10 text-destructive') : 'bg-success/10 text-success'}`}>
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Days Overdue</p>
            <p className={`text-xl font-bold ${daysOverdue >= 90 ? 'text-destructive' : daysOverdue >= 30 ? 'text-orange-500' : daysOverdue > 0 ? 'text-destructive' : 'text-success'}`}>
              {daysOverdue}
              {daysOverdue > 0 && <span className="inline-block ml-2 w-2 h-2 rounded-full bg-destructive animate-pulse-dot" />}
              {daysOverdue === 0 && <span className="inline-block ml-2 w-2 h-2 rounded-full bg-success" />}
            </p>
          </div>
        </div>

        {/* Months Overdue (unpaid installments) */}
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-lg ${monthsOverdue > 0 ? 'bg-orange-500/10 text-orange-500' : 'bg-secondary text-muted-foreground'}`}>
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Months Overdue</p>
            <p className={`text-xl font-bold ${monthsOverdue > 0 ? 'text-orange-500' : ''}`}>
              {monthsOverdue}
              {monthsOverdue > 0 && <span className="inline-block ml-2 w-2 h-2 rounded-full bg-orange-500 animate-pulse-dot" />}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Unpaid installments due</p>
          </div>
        </div>

        {/* Months in Arrears (aged) */}
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
            <p className="text-[10px] text-muted-foreground mt-0.5">Fully aged past due</p>
          </div>
        </div>

        {/* Current Balance */}
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-lg ${displayBalance > 0 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Current Balance</p>
            <p className={`text-xl font-bold ${displayBalance > 0 ? 'text-warning' : 'text-success'}`}>
              {formatCurrency(displayBalance)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
