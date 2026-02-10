import { Beneficiary, Transaction, calculateLoan } from './loanCalculations';

const staffNames = [
  { name: 'Adebayo Ogundimu', dept: 'Engineering', empId: 'EMP-1024' },
  { name: 'Chioma Nwosu', dept: 'Finance', empId: 'EMP-1031' },
  { name: 'Fatima Abdullahi', dept: 'Human Resources', empId: 'EMP-1015' },
  { name: 'Emeka Okafor', dept: 'Operations', empId: 'EMP-1042' },
  { name: 'Ngozi Eze', dept: 'Marketing', empId: 'EMP-1009' },
  { name: 'Ibrahim Musa', dept: 'IT', empId: 'EMP-1053' },
  { name: 'Aisha Bello', dept: 'Admin', empId: 'EMP-1067' },
  { name: 'Oluwaseun Adeyemi', dept: 'Engineering', empId: 'EMP-1078' },
];

function createBeneficiary(
  staff: { name: string; dept: string; empId: string },
  amount: number,
  tenor: number,
  disbDate: Date,
  paidMonths: number,
  defaults: number
): Beneficiary {
  const loan = calculateLoan({
    principal: amount,
    annualRate: 6,
    tenorMonths: tenor,
    moratoriumMonths: 1,
    disbursementDate: disbDate,
  });

  const totalPaid = loan.monthlyEMI * paidMonths;
  const outstanding = loan.totalPayment - totalPaid;
  const status: Beneficiary['status'] =
    paidMonths >= tenor ? 'completed' : defaults > 2 ? 'defaulted' : 'active';

  return {
    id: staff.empId,
    name: staff.name,
    employeeId: staff.empId,
    department: staff.dept,
    loanAmount: amount,
    tenorMonths: tenor,
    disbursementDate: disbDate,
    commencementDate: loan.commencementDate,
    terminationDate: loan.terminationDate,
    monthlyEMI: loan.monthlyEMI,
    totalPaid: Math.round(totalPaid * 100) / 100,
    outstandingBalance: Math.round(Math.max(0, outstanding) * 100) / 100,
    status,
    defaultCount: defaults,
  };
}

export const mockBeneficiaries: Beneficiary[] = [
  createBeneficiary(staffNames[0], 2500000, 36, new Date('2024-03-15'), 10, 0),
  createBeneficiary(staffNames[1], 1800000, 24, new Date('2024-06-01'), 6, 1),
  createBeneficiary(staffNames[2], 3000000, 48, new Date('2023-11-20'), 14, 0),
  createBeneficiary(staffNames[3], 1200000, 12, new Date('2024-01-10'), 12, 0),
  createBeneficiary(staffNames[4], 4500000, 60, new Date('2024-08-05'), 4, 2),
  createBeneficiary(staffNames[5], 2000000, 36, new Date('2024-04-22'), 8, 3),
  createBeneficiary(staffNames[6], 900000, 12, new Date('2024-09-01'), 3, 0),
  createBeneficiary(staffNames[7], 3500000, 48, new Date('2024-02-14'), 11, 1),
];

export const mockTransactions: Transaction[] = [
  { id: 'TXN-001', beneficiaryId: 'EMP-1024', rrrNumber: 'RRR-290384756', amount: 76042.78, datePaid: new Date('2024-05-28'), monthFor: 1 },
  { id: 'TXN-002', beneficiaryId: 'EMP-1024', rrrNumber: 'RRR-290384757', amount: 76042.78, datePaid: new Date('2024-06-25'), monthFor: 2 },
  { id: 'TXN-003', beneficiaryId: 'EMP-1031', rrrNumber: 'RRR-310294856', amount: 79712.45, datePaid: new Date('2024-08-15'), monthFor: 1 },
  { id: 'TXN-004', beneficiaryId: 'EMP-1015', rrrNumber: 'RRR-420183947', amount: 70512.30, datePaid: new Date('2024-01-20'), monthFor: 1 },
  { id: 'TXN-005', beneficiaryId: 'EMP-1042', rrrNumber: 'RRR-530274638', amount: 103124.56, datePaid: new Date('2024-03-10'), monthFor: 1 },
];

export const portfolioStats = {
  totalDisbursed: mockBeneficiaries.reduce((s, b) => s + b.loanAmount, 0),
  totalOutstanding: mockBeneficiaries.reduce((s, b) => s + b.outstandingBalance, 0),
  totalCollected: mockBeneficiaries.reduce((s, b) => s + b.totalPaid, 0),
  activeLoanCount: mockBeneficiaries.filter((b) => b.status === 'active').length,
  completedCount: mockBeneficiaries.filter((b) => b.status === 'completed').length,
  defaultedCount: mockBeneficiaries.filter((b) => b.status === 'defaulted').length,
  totalBeneficiaries: mockBeneficiaries.length,
};
