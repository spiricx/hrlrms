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
    dueDate.setMonth(dueDate.getMonth() + i);

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

export type LoanStatus = 'active' | 'completed' | 'defaulted' | 'pending';

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
