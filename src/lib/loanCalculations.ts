export interface LoanParams {
  principal: number;
  annualRate: number; // e.g. 6 for 6%
  tenorMonths: number; // max 60
  moratoriumMonths: number; // 1
  disbursementDate: Date;
}

export interface ScheduleEntry {
  month: number;
  dueDate: Date;
  openingBalance: number;
  principal: number;
  interest: number;
  emi: number;
  closingBalance: number;
}

export interface LoanSummary {
  monthlyEMI: number;
  totalInterest: number;
  totalPayment: number;
  terminationDate: Date;
  commencementDate: Date;
  schedule: ScheduleEntry[];
}

export function calculateLoan(params: LoanParams): LoanSummary {
  const { principal, annualRate, tenorMonths, moratoriumMonths, disbursementDate } = params;
  const monthlyRate = annualRate / 100 / 12;

  // EMI formula: P * r * (1+r)^n / ((1+r)^n - 1)
  const n = tenorMonths;
  const rawEmi =
    monthlyRate === 0
      ? principal / n
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) /
        (Math.pow(1 + monthlyRate, n) - 1);

  // Round EMI to 2 decimal places FIRST, then use everywhere for consistency
  const emi = Math.round(rawEmi * 100) / 100;

  const commencementDate = new Date(disbursementDate);
  commencementDate.setMonth(commencementDate.getMonth() + moratoriumMonths);

  const schedule: ScheduleEntry[] = [];
  let balance = principal;

  for (let i = 1; i <= n; i++) {
    const dueDate = new Date(commencementDate);
    dueDate.setMonth(dueDate.getMonth() + (i - 1));

    const interest = Math.round(balance * monthlyRate * 100) / 100;

    // For the last month, absorb any rounding remainder so closing balance is exactly 0
    const isLastMonth = i === n;
    const principalPart = isLastMonth
      ? Math.round(balance * 100) / 100
      : Math.round((emi - interest) * 100) / 100;
    const lastEmi = isLastMonth ? Math.round((principalPart + interest) * 100) / 100 : emi;
    const closingBalance = isLastMonth ? 0 : Math.round((balance - principalPart) * 100) / 100;

    schedule.push({
      month: i,
      dueDate,
      openingBalance: Math.round(balance * 100) / 100,
      principal: principalPart,
      interest,
      emi: lastEmi,
      closingBalance,
    });

    balance = closingBalance;
  }

  const terminationDate = schedule[schedule.length - 1]?.dueDate ?? commencementDate;
  const totalPayment = Math.round(emi * n * 100) / 100;

  return {
    monthlyEMI: emi,
    totalInterest: Math.round((totalPayment - principal) * 100) / 100,
    totalPayment,
    terminationDate,
    commencementDate,
    schedule,
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatTenor(months: number): string {
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} Month${rem !== 1 ? 's' : ''}`;
  if (rem === 0) return `${years} Year${years !== 1 ? 's' : ''}`;
  return `${years} Year${years !== 1 ? 's' : ''} ${rem} Month${rem !== 1 ? 's' : ''}`;
}

export type LoanStatus = 'active' | 'completed' | 'defaulted' | 'pending';

/**
 * Strip time from a Date, returning midnight of that day.
 * Used so all date comparisons are at day-level granularity.
 */
export function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Calculate how many monthly instalments are due as of today (day-level).
 * A month's payment is due when today >= its due date.
 * Month i due date = commencement + (i-1) months.
 *
 * On the commencement date itself, the first instalment is already due (1 month due).
 */
export function getMonthsDue(commencementDate: string | Date, tenorMonths: number): number {
  const today = stripTime(new Date());
  const comm = stripTime(new Date(commencementDate));
  if (today < comm) return 0;

  // Iterate through the schedule to count instalments whose due date has arrived.
  // This handles month-end edge cases correctly and is consistent with
  // the amortization schedule generation in calculateLoan().
  let count = 0;
  for (let i = 1; i <= tenorMonths; i++) {
    const dueDate = new Date(comm);
    dueDate.setMonth(dueDate.getMonth() + (i - 1));
    if (today >= stripTime(dueDate)) {
      count = i;
    } else {
      break;
    }
  }
  return count;
}

export interface OverdueArrearsInfo {
  /** Months where payment is due (including current) but not paid */
  overdueMonths: number;
  /** Amount of all due but unpaid instalments */
  overdueAmount: number;
  /** Months where a FULL subsequent period has passed without payment (excludes current due month) */
  monthsInArrears: number;
  /** Amount of instalments in arrears (excludes the current due month) */
  arrearsAmount: number;
}

/**
 * Calculate overdue and arrears metrics for a beneficiary.
 *
 * Key distinction:
 * - **Overdue**: any instalment whose due date has arrived (today >= dueDate) and is unpaid.
 *   On the due date itself the first instalment is 1 month overdue.
 * - **In Arrears**: overdue instalments where the *next* period's due date has ALSO arrived.
 *   i.e. an instalment only enters "arrears" once it is at least 30 days past its own due date.
 *   This ensures DPD-based thresholds (30, 60, 90 days) are correctly sequenced.
 *
 * Calculation uses only total_paid vs expected schedule (no transaction-level lookup needed)
 * because the beneficiaries table is kept in sync by DB triggers after every repayment.
 */
export function getOverdueAndArrears(
  commencementDate: string | Date,
  tenorMonths: number,
  monthlyEmi: number,
  totalPaid: number,
  outstandingBalance: number,
  status: string,
): OverdueArrearsInfo {
  const zero: OverdueArrearsInfo = { overdueMonths: 0, overdueAmount: 0, monthsInArrears: 0, arrearsAmount: 0 };
  if (status === 'completed' || outstandingBalance <= 0) return zero;

  const monthsDue = getMonthsDue(commencementDate, tenorMonths);
  if (monthsDue <= 0) return zero;

  const emi = monthlyEmi;
  if (emi <= 0) return zero;

  const today = stripTime(new Date());
  const comm = stripTime(new Date(commencementDate));

  // Expected cumulative total for all months that are due
  const expectedTotal = monthsDue * emi;
  const overdueDeficit = Math.max(0, expectedTotal - totalPaid);

  if (overdueDeficit <= 0) return zero;

  // How many full EMIs are unpaid (capped at months due)
  const overdueMonths = Math.min(Math.ceil(overdueDeficit / emi), monthsDue);
  const overdueAmount = Math.round(overdueDeficit * 100) / 100;

  // "In Arrears" = those overdue instalments where the NEXT instalment's due date has arrived.
  // i.e. the due date of the first unpaid instalment is STRICTLY before today (DPD >= 1 and
  // the following period has also elapsed, meaning DPD >= 30 effectively).
  // We count arrears months as those unpaid instalments whose due date is strictly < today
  // AND whose NEXT due date is also <= today (they are at least one full period overdue).
  const paidMonths = Math.min(Math.floor(Math.round(totalPaid * 100) / 100 / emi), tenorMonths);

  let arrearsMonths = 0;
  for (let m = paidMonths + 1; m <= paidMonths + overdueMonths && m <= tenorMonths; m++) {
    // Due date of instalment m (0-indexed offset from commencement)
    const dueDate = new Date(comm);
    dueDate.setMonth(dueDate.getMonth() + (m - 1));
    const due = stripTime(dueDate);

    // Due date of the NEXT instalment
    const nextDue = new Date(comm);
    nextDue.setMonth(nextDue.getMonth() + m); // m is already +1
    const nextDueStripped = stripTime(nextDue);

    // In arrears only when the next instalment's due date has also arrived
    if (today >= nextDueStripped) {
      arrearsMonths++;
    }
  }

  const arrearsAmount = Math.round(arrearsMonths * emi * 100) / 100;

  return { overdueMonths, overdueAmount, monthsInArrears: arrearsMonths, arrearsAmount };
}

export interface Beneficiary {
  id: string;
  name: string;
  employeeId: string;
  department: string;
  loanAmount: number;
  tenorMonths: number;
  disbursementDate: Date;
  commencementDate: Date;
  terminationDate: Date;
  monthlyEMI: number;
  totalPaid: number;
  outstandingBalance: number;
  status: LoanStatus;
  defaultCount: number;
}

export interface Transaction {
  id: string;
  beneficiaryId: string;
  rrrNumber: string;
  amount: number;
  datePaid: Date;
  monthFor: number; // which month in the schedule
}
