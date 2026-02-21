export interface LoanParams {
  principal: number;
  annualRate: number; // e.g. 6 for 6%
  tenorMonths: number; // max 60
  moratoriumMonths: number; // 1
  disbursementDate: Date;
}

export type TransactionType = 'Disbursement' | 'Interest Capitalization' | 'Repayment';

export interface ScheduleEntry {
  month: number;
  dueDate: Date;
  openingBalance: number;
  principal: number;
  interest: number;
  emi: number;
  closingBalance: number;
  /** Actual/365 fields */
  transactionType: TransactionType;
  daysInPeriod: number;
  beginningBalance: number;
  totalPayment: number;
  endingBalance: number;
}

export interface LoanSummary {
  monthlyEMI: number;
  totalInterest: number;
  totalPayment: number;
  terminationDate: Date;
  commencementDate: Date;
  /** Repayment entries only (month 1..N) — backward compatible */
  schedule: ScheduleEntry[];
  /** All entries: Disbursement + Capitalization + Repayments */
  fullSchedule: ScheduleEntry[];
  /** Balance after moratorium interest capitalization */
  capitalizedBalance: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

function getLastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

/**
 * Calculate loan schedule using Actual/365 interest with moratorium capitalization.
 *
 * Method: Re-amortizing annuity after moratorium.
 * - During moratorium: interest accrues daily (Actual/365) and is capitalized.
 * - After moratorium: each period's payment is recalculated as an annuity
 *   using that period's Actual/365 rate and the remaining number of periods,
 *   producing variable EMI with increasing principal and decreasing interest.
 */
export function calculateLoan(params: LoanParams): LoanSummary {
  const { principal, annualRate, tenorMonths, moratoriumMonths, disbursementDate } = params;
  const rate = annualRate / 100;

  const fullSchedule: ScheduleEntry[] = [];

  // === ROW 0: DISBURSEMENT ===
  fullSchedule.push({
    month: 0,
    dueDate: new Date(disbursementDate),
    openingBalance: 0,
    principal: principal,
    interest: 0,
    emi: 0,
    closingBalance: principal,
    transactionType: 'Disbursement',
    daysInPeriod: 0,
    beginningBalance: 0,
    totalPayment: 0,
    endingBalance: principal,
  });

  // === MORATORIUM: INTEREST ACCRUAL & CAPITALIZATION ===
  let balance = principal;
  let periodStart = new Date(disbursementDate);

  for (let m = 0; m < moratoriumMonths; m++) {
    const monthEnd = getLastDayOfMonth(periodStart.getFullYear(), periodStart.getMonth());
    const days = daysBetween(periodStart, monthEnd);
    const interest = round2(balance * rate * (days / 365));
    const capDate = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1);
    const newBalance = round2(balance + interest);

    fullSchedule.push({
      month: 0,
      dueDate: capDate,
      openingBalance: balance,
      principal: interest,
      interest: interest,
      emi: 0,
      closingBalance: newBalance,
      transactionType: 'Interest Capitalization',
      daysInPeriod: days,
      beginningBalance: balance,
      totalPayment: 0,
      endingBalance: newBalance,
    });

    balance = newBalance;
    periodStart = capDate;
  }

  const capitalizedBalance = balance;
  const commencementDate = new Date(periodStart);

  // === REPAYMENT SCHEDULE (Re-amortizing Annuity + Actual/365 Interest) ===
  const repaymentSchedule: ScheduleEntry[] = [];

  for (let i = 1; i <= tenorMonths; i++) {
    // Payment date = last day of the month offset from commencement
    const refDate = new Date(commencementDate);
    refDate.setMonth(refDate.getMonth() + (i - 1));
    const payDate = getLastDayOfMonth(refDate.getFullYear(), refDate.getMonth());

    // Days in period = calendar days in the payment month
    const days = payDate.getDate();
    const periodicRate = rate * days / 365;
    const interest = round2(balance * periodicRate);

    const isLast = i === tenorMonths;
    const remaining = tenorMonths - i + 1;

    let payment: number;
    let principalPortion: number;

    if (isLast) {
      // Final month: clear the entire remaining balance
      principalPortion = round2(balance);
      payment = round2(principalPortion + interest);
    } else {
      // Re-amortizing annuity: recalculate payment each period using
      // this period's Actual/365 rate and remaining number of periods
      payment = round2(balance * periodicRate / (1 - Math.pow(1 + periodicRate, -remaining)));
      principalPortion = round2(payment - interest);
    }

    const newBalance = isLast ? 0 : round2(balance - principalPortion);

    const entry: ScheduleEntry = {
      month: i,
      dueDate: payDate,
      openingBalance: round2(balance),
      principal: principalPortion,
      interest,
      emi: payment,
      closingBalance: newBalance,
      transactionType: 'Repayment',
      daysInPeriod: days,
      beginningBalance: round2(balance),
      totalPayment: payment,
      endingBalance: newBalance,
    };

    repaymentSchedule.push(entry);
    fullSchedule.push(entry);

    balance = newBalance;
  }

  const terminationDate = repaymentSchedule[repaymentSchedule.length - 1]?.dueDate ?? commencementDate;
  const totalRepayment = round2(repaymentSchedule.reduce((sum, e) => sum + e.totalPayment, 0));
  const totalInterest = round2(totalRepayment - principal);

  // Reference EMI: standard PMT annuity formula with monthly compounding (r = annualRate / 12)
  const monthlyRate = rate / 12;
  const referenceEMI = round2(principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -tenorMonths)));

  return {
    monthlyEMI: referenceEMI,
    totalInterest,
    totalPayment: totalRepayment,
    terminationDate,
    commencementDate,
    schedule: repaymentSchedule,
    fullSchedule,
    capitalizedBalance,
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
