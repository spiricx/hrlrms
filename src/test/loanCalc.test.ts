import { describe, it, expect } from 'vitest';
import { calculateLoan } from '../lib/loanCalculations';

describe('Loan Calculation - ₦17.85M (March 4, 2021)', () => {
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

  it('fixed EMI for periods 1-59 (constant payment)', () => {
    const emi = loan.monthlyEMI;
    for (let i = 0; i < 59; i++) {
      expect(loan.schedule[i].emi).toBe(emi);
    }
  });

  it('monthlyEMI = PMT on capitalized balance (not original principal)', () => {
    // PMT = capitalizedBalance × (r/12) / (1 - (1+r/12)^-60)
    const r = 0.06 / 12;
    const expectedPMT = Math.round(loan.capitalizedBalance * r / (1 - Math.pow(1 + r, -60)) * 100) / 100;
    expect(loan.monthlyEMI).toBe(expectedPMT);
  });
});

describe('Loan Calculation - ₦1M Document Validation (March 4, 2021)', () => {
  const loan = calculateLoan({
    principal: 1000000,
    annualRate: 6,
    tenorMonths: 60,
    moratoriumMonths: 1,
    disbursementDate: new Date(2021, 2, 4), // March 4, 2021 LOCAL
  });

  it('moratorium: 27 days, interest = ₦4,438.36', () => {
    const capEntry = loan.fullSchedule.find(e => e.transactionType === 'Interest Capitalization');
    expect(capEntry).toBeDefined();
    expect(capEntry!.daysInPeriod).toBe(27);
    expect(capEntry!.interest).toBeCloseTo(4438.36, 1);
  });

  it('capitalized balance = ₦1,004,438.36', () => {
    expect(loan.capitalizedBalance).toBeCloseTo(1004438.36, 1);
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

  it('fixed EMI ≈ ₦19,418.55 (PMT on capitalized balance)', () => {
    expect(loan.monthlyEMI).toBeCloseTo(19418.55, 0);
  });

  it('62-row full schedule (1 disbursement + 1 capitalization + 60 repayments)', () => {
    expect(loan.fullSchedule.length).toBe(62);
    expect(loan.fullSchedule[0].transactionType).toBe('Disbursement');
    expect(loan.fullSchedule[1].transactionType).toBe('Interest Capitalization');
    expect(loan.fullSchedule[2].transactionType).toBe('Repayment');
  });

  it('60 repayment periods', () => {
    expect(loan.schedule.length).toBe(60);
  });

  it('final balance = ₦0.00', () => {
    const last = loan.schedule[loan.schedule.length - 1];
    expect(last.endingBalance).toBe(0);
  });

  it('fixed payment for periods 1-59, adjusted final', () => {
    const emi = loan.monthlyEMI;
    for (let i = 0; i < 59; i++) {
      expect(loan.schedule[i].emi).toBe(emi);
    }
    // Final payment may differ (adjusted to clear balance)
    const last = loan.schedule[59];
    expect(last.endingBalance).toBe(0);
  });

  it('total repaid ≈ ₦1,165,000 range (document says ≈ ₦1,165,113)', () => {
    // Document uses "≈" — minor variance from Actual/365 day-count rounding
    expect(loan.totalPayment).toBeGreaterThan(1164000);
    expect(loan.totalPayment).toBeLessThan(1167000);
  });

  it('total interest ≈ ₦165,000 range (document says ≈ ₦165,113)', () => {
    expect(loan.totalInterest).toBeGreaterThan(164000);
    expect(loan.totalInterest).toBeLessThan(167000);
  });

  it('sum of all principal portions = effective principal (capitalized balance)', () => {
    const totalPrincipal = loan.schedule.reduce((sum, e) => sum + e.principal, 0);
    expect(totalPrincipal).toBeCloseTo(loan.capitalizedBalance, 0);
  });
});
