import { describe, it, expect } from 'vitest';
import { calculateLoan } from '../lib/loanCalculations';

describe('Loan Calculation - March 4, 2021 disbursement', () => {
  const loan = calculateLoan({
    principal: 17850000,
    annualRate: 6,
    tenorMonths: 60,
    moratoriumMonths: 1,
    disbursementDate: new Date(2021, 2, 4), // March 4, 2021 LOCAL
  });

  it('moratorium: 27 days interest capitalized', () => {
    const capEntry = loan.fullSchedule.find(e => e.transactionType === 'Interest Capitalization');
    expect(capEntry).toBeDefined();
    expect(capEntry!.daysInPeriod).toBe(27);
    expect(capEntry!.interest).toBeCloseTo(79224.66, 1);
    expect(capEntry!.endingBalance).toBeCloseTo(17929224.66, 1);
  });

  it('capitalized balance = 17,929,224.66', () => {
    expect(loan.capitalizedBalance).toBeCloseTo(17929224.66, 1);
  });

  it('commencement date = April 1, 2021', () => {
    expect(loan.commencementDate.getFullYear()).toBe(2021);
    expect(loan.commencementDate.getMonth()).toBe(3);
    expect(loan.commencementDate.getDate()).toBe(1);
  });

  it('termination date = March 31, 2026', () => {
    expect(loan.terminationDate.getFullYear()).toBe(2026);
    expect(loan.terminationDate.getMonth()).toBe(2);
    expect(loan.terminationDate.getDate()).toBe(31);
  });

  it('first repayment: April 30, 2021 - 30 days', () => {
    const first = loan.schedule[0];
    expect(first.dueDate.getMonth()).toBe(3);
    expect(first.dueDate.getDate()).toBe(30);
    expect(first.daysInPeriod).toBe(30);
  });

  it('60 repayment periods', () => {
    expect(loan.schedule.length).toBe(60);
  });

  it('final balance = 0', () => {
    const last = loan.schedule[loan.schedule.length - 1];
    expect(last.endingBalance).toBe(0);
  });
});
