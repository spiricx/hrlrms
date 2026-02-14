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
  const emi =
    monthlyRate === 0
      ? principal / n
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) /
        (Math.pow(1 + monthlyRate, n) - 1);

  const commencementDate = new Date(disbursementDate);
  commencementDate.setMonth(commencementDate.getMonth() + moratoriumMonths);

  const schedule: ScheduleEntry[] = [];
  let balance = principal;

  // Moratorium only delays commencement; no interest capitalization
  const adjustedEMI = emi;

  for (let i = 1; i <= n; i++) {
    const dueDate = new Date(commencementDate);
    dueDate.setMonth(dueDate.getMonth() + (i - 1));

    const interest = balance * monthlyRate;
    const principalPart = adjustedEMI - interest;
    const closingBalance = Math.max(0, balance - principalPart);

    schedule.push({
      month: i,
      dueDate,
      openingBalance: Math.round(balance * 100) / 100,
      principal: Math.round(principalPart * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      emi: Math.round(adjustedEMI * 100) / 100,
      closingBalance: Math.round(closingBalance * 100) / 100,
    });

    balance = closingBalance;
  }

  const terminationDate = schedule[schedule.length - 1]?.dueDate ?? commencementDate;

  return {
    monthlyEMI: Math.round(adjustedEMI * 100) / 100,
    totalInterest: Math.round(schedule.reduce((sum, e) => sum + e.interest, 0) * 100) / 100,
    totalPayment: Math.round(adjustedEMI * n * 100) / 100,
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
 */
export function getMonthsDue(commencementDate: string | Date, tenorMonths: number): number {
  const today = stripTime(new Date());
  const comm = stripTime(new Date(commencementDate));
  if (today < comm) return 0;

  const monthsDiff =
    (today.getFullYear() - comm.getFullYear()) * 12 +
    (today.getMonth() - comm.getMonth());

  // Check if today's day-of-month >= commencement's day-of-month
  const monthsDue = today.getDate() >= comm.getDate() ? monthsDiff + 1 : monthsDiff;
  return Math.min(Math.max(monthsDue, 0), tenorMonths);
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
 * - **Overdue**: any instalment whose due date has arrived and is unpaid.
 *   On the due date itself, the payment is "overdue" (1 month overdue).
 * - **In Arrears**: an instalment where the NEXT month's due date has also
 *   arrived. On the due date, arrears = 0. One period later, arrears = 1.
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

  // Overdue: all months due including current
  const expectedTotal = monthsDue * emi;
  const overdueDeficit = Math.max(0, expectedTotal - totalPaid);
  const overdueMonths = Math.min(Math.ceil(overdueDeficit / emi), monthsDue);
  const overdueAmount = Math.round(overdueDeficit * 100) / 100;

  // Arrears: months due EXCLUDING the current (most recent) due month
  const monthsPast = Math.max(0, monthsDue - 1);
  const expectedPast = monthsPast * emi;
  const arrearsDeficit = Math.max(0, expectedPast - totalPaid);
  const monthsInArrears = Math.min(Math.ceil(arrearsDeficit / emi), monthsPast);
  const arrearsAmount = Math.round(arrearsDeficit * 100) / 100;

  return { overdueMonths, overdueAmount, monthsInArrears, arrearsAmount };
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
