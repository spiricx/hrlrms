import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, Award, Target, BarChart3, Download, Printer, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import DateRangeFilter from '@/components/DateRangeFilter';

type StaffMember = { id: string; title: string; surname: string; first_name: string; staff_id: string; state: string; branch: string; designation: string; email: string; status: string; nhf_number: string | null; };
type Beneficiary = { id: string; state: string; bank_branch: string; status: string; loan_amount: number; outstanding_balance: number; total_paid: number; monthly_emi: number; created_by: string | null; name: string; employee_id: string; tenor_months: number; interest_rate: number; commencement_date: string; termination_date: string; loan_reference_number: string | null; };
type Transaction = { id: string; beneficiary_id: string; amount: number; date_paid: string; recorded_by: string | null; };
type Profile = { user_id: string; email: string; };

function formatNaira(n: number) {
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `₦${(n / 1e3).toFixed(0)}K`;
  return `₦${n.toLocaleString()}`;
}

function formatNairaFull(n: number) {
  return `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function StaffPerformance() {
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();

  useEffect(() => {
    (async () => {
      const [s, b, t, p] = await Promise.all([
        supabase.from('staff_members').select('id,title,surname,first_name,staff_id,state,branch,designation,email,status,nhf_number'),
        supabase.from('beneficiaries').select('id,state,bank_branch,status,loan_amount,outstanding_balance,total_paid,monthly_emi,created_by,name,employee_id,tenor_months,interest_rate,commencement_date,termination_date,loan_reference_number'),
        supabase.from('transactions').select('id,beneficiary_id,amount,date_paid,recorded_by'),
        supabase.from('profiles').select('user_id,email'),
      ]);
      setStaff((s.data as any[]) || []);
      setBeneficiaries((b.data as any[]) || []);
      setTransactions((t.data as any[]) || []);
      setProfiles((p.data as any[]) || []);
      setLoading(false);
    })();
  }, []);

  // Build a map from staff email -> user_id using profiles
  const emailToUserId = useMemo(() => {
    const map = new Map<string, string>();
    profiles.forEach(p => { if (p.email) map.set(p.email.toLowerCase(), p.user_id); });
    return map;
  }, [profiles]);

  const staffMetrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Pre-index transactions by recorded_by for O(1) lookup
    const txnsByRecorder = new Map<string, Transaction[]>();
    transactions.forEach(t => {
      if (!t.recorded_by) return;
      const list = txnsByRecorder.get(t.recorded_by) || [];
      list.push(t);
      txnsByRecorder.set(t.recorded_by, list);
    });

    // Pre-index transactions by beneficiary_id for fallback
    const txnsByBeneficiary = new Map<string, Transaction[]>();
    transactions.forEach(t => {
      const list = txnsByBeneficiary.get(t.beneficiary_id) || [];
      list.push(t);
      txnsByBeneficiary.set(t.beneficiary_id, list);
    });

    // Determine the latest month/year that has any transactions (for meaningful MTD)
    let latestYear = currentYear;
    let latestMonth = currentMonth;
    transactions.forEach(t => {
      const d = new Date(t.date_paid);
      const y = d.getFullYear();
      const m = d.getMonth();
      if (y > latestYear || (y === latestYear && m > latestMonth)) {
        latestYear = y;
        latestMonth = m;
      }
    });
    // If no transactions exist in current month, fall back to latest available month
    const hasCurrentMonthTxns = transactions.some(t => {
      const d = new Date(t.date_paid);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    const reportMonth = hasCurrentMonthTxns ? currentMonth : latestMonth;
    const reportYear = hasCurrentMonthTxns ? currentYear : latestYear;

    const q = searchQuery.toLowerCase().trim();
    return staff.filter(s => {
      const matchesState = filterState === 'all' || s.state === filterState;
      if (!matchesState) return false;
      if (!q) return true;
      const fullName = `${s.title} ${s.surname} ${s.first_name}`.toLowerCase();
      return fullName.includes(q) || s.staff_id.toLowerCase().includes(q) || (s.nhf_number || '').toLowerCase().includes(q);
    }).map(s => {
      // Resolve this staff member's user_id via email → profiles lookup
      const userId = emailToUserId.get((s.email || '').toLowerCase()) || null;

      // --- LOAN PORTFOLIO (created_by attribution) ---
      // Loans CREATED by this staff member specifically (via created_by = userId)
      // Fall back to state+branch match if no userId found
      const myBeneficiariesAll = userId
        ? beneficiaries.filter(b => b.created_by === userId)
        : beneficiaries.filter(b => b.state === s.state && b.bank_branch === s.branch);
      // Apply date range filter
      const myBeneficiaries = myBeneficiariesAll.filter(b => {
        if (fromDate) {
          const d = new Date(b.commencement_date);
          if (d < fromDate) return false;
        }
        if (toDate) {
          const d = new Date(b.commencement_date);
          const endOfDay = new Date(toDate);
          endOfDay.setHours(23, 59, 59, 999);
          if (d > endOfDay) return false;
        }
        return true;
      });

      const activeBens = myBeneficiaries.filter(b => b.status === 'active');

      // --- CORRECT NPL CALCULATION using 90+ Days Past Due (not a proxy) ---
      // Mirrors the logic in Dashboard.tsx and NplStatus.tsx for consistency
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const nplBens = activeBens.filter(b => {
        if (Number(b.outstanding_balance) <= 0) return false;
        const commDate = new Date(b.commencement_date);
        commDate.setHours(0, 0, 0, 0);
        if (today < commDate) return false;
        const monthlyEmi = Number(b.monthly_emi);
        if (monthlyEmi <= 0) return false;
        const totalPaid = Number(b.total_paid);
        // Count how many instalments are due
        let dueMonths = 0;
        for (let i = 1; i <= b.tenor_months; i++) {
          const dueDate = new Date(commDate);
          dueDate.setMonth(dueDate.getMonth() + (i - 1));
          if (today >= dueDate) dueMonths = i;
          else break;
        }
        if (dueMonths <= 0) return false;
        const expectedTotal = dueMonths * monthlyEmi;
        const unpaid = Math.max(0, expectedTotal - totalPaid);
        const overdueMonths = Math.ceil(unpaid / monthlyEmi);
        if (overdueMonths <= 0) return false;
        // Find the first unpaid month's due date for DPD
        const paidMonths = Math.floor(Math.round(totalPaid * 100) / 100 / monthlyEmi);
        const firstUnpaidIdx = paidMonths; // 0-based
        const firstUnpaidDue = new Date(commDate);
        firstUnpaidDue.setMonth(firstUnpaidDue.getMonth() + firstUnpaidIdx);
        firstUnpaidDue.setHours(0, 0, 0, 0);
        const dpd = Math.floor((today.getTime() - firstUnpaidDue.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return dpd >= 90;
      });

      const portfolioValue = activeBens.reduce((sum, b) => sum + Number(b.loan_amount), 0);
      const totalOutstanding = activeBens.reduce((sum, b) => sum + Number(b.outstanding_balance), 0);
      const totalPaid = activeBens.reduce((sum, b) => sum + Number(b.total_paid), 0);

      // --- RECOVERY: recorded_by attribution — INDEPENDENT of loan creation ---
      // A staff member may record repayments on ANY beneficiary, not just ones they created.
      // We look up ALL transactions recorded_by this staff's userId.
      let monthTxns: Transaction[] = [];
      let allTimeTxns: Transaction[] = [];

      if (userId) {
        const allRecorded = txnsByRecorder.get(userId) || [];
        allTimeTxns = allRecorded;
        // MTD: use latest month with data (fallback from current month if no current-month txns)
        monthTxns = allRecorded.filter(t => {
          const d = new Date(t.date_paid);
          return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
        });
      } else {
        // Fallback: transactions on beneficiaries in their state+branch
        const benIds = new Set(myBeneficiaries.map(b => b.id));
        benIds.forEach(benId => {
          const benTxns = txnsByBeneficiary.get(benId) || [];
          benTxns.forEach(t => {
            allTimeTxns.push(t);
            const d = new Date(t.date_paid);
            if (d.getMonth() === reportMonth && d.getFullYear() === reportYear) {
              monthTxns.push(t);
            }
          });
        });
      }

      const recoveryMTD = monthTxns.reduce((sum, t) => sum + Number(t.amount), 0);
      const recoveryAllTime = allTimeTxns.reduce((sum, t) => sum + Number(t.amount), 0);
      // Use all-time recovery for ranking when MTD is zero for everyone
      const rankingValue = recoveryAllTime;

      const nplOutstanding = nplBens.reduce((s, b) => s + Number(b.outstanding_balance), 0);
      const nplRatio = totalOutstanding > 0 ? (nplOutstanding / totalOutstanding * 100) : 0;
      // Recovery rate: percentage of expected monthly EMI recovered in the report period
      const expectedMonthlyEmi = activeBens.reduce((s, b) => s + Number(b.monthly_emi), 0);
      const recoveryRate = expectedMonthlyEmi > 0 ? (recoveryMTD / expectedMonthlyEmi * 100) : 0;

      return {
        ...s,
        userId,
        totalLoans: myBeneficiaries.length,
        activeLoans: activeBens.length,
        portfolioValue,
        totalOutstanding,
        totalPaid,
        recoveryMTD,
        recoveryAllTime,
        rankingValue,
        nplCount: nplBens.length,
        nplRatio: Math.round(nplRatio * 10) / 10,
        recoveryRate: Math.min(Math.round(recoveryRate), 200),
        beneficiaries: myBeneficiaries,
        reportMonth,
        reportYear,
      };
    }).sort((a, b) => b.rankingValue - a.rankingValue);
  }, [staff, beneficiaries, transactions, emailToUserId, filterState, searchQuery, fromDate, toDate]);

  // Deduplicated portfolio totals (from beneficiaries directly, not staff metrics which double-count)
  const portfolioTotals = useMemo(() => {
    const filtered = filterState === 'all' ? beneficiaries : beneficiaries.filter(b => b.state === filterState);
    const active = filtered.filter(b => b.status === 'active');

    // Correct NPL: 90+ DPD using installment aging (same logic as Dashboard & NPL modules)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const npl = active.filter(b => {
      if (Number(b.outstanding_balance) <= 0) return false;
      const commDate = new Date(b.commencement_date);
      commDate.setHours(0, 0, 0, 0);
      if (today < commDate) return false;
      const monthlyEmi = Number(b.monthly_emi);
      if (monthlyEmi <= 0) return false;
      const totalPaid = Number(b.total_paid);
      let dueMonths = 0;
      for (let i = 1; i <= b.tenor_months; i++) {
        const dueDate = new Date(commDate);
        dueDate.setMonth(dueDate.getMonth() + (i - 1));
        if (today >= dueDate) dueMonths = i; else break;
      }
      if (dueMonths <= 0) return false;
      const unpaid = Math.max(0, dueMonths * monthlyEmi - totalPaid);
      const overdueMonths = Math.ceil(unpaid / monthlyEmi);
      if (overdueMonths <= 0) return false;
      const paidMonths = Math.floor(Math.round(totalPaid * 100) / 100 / monthlyEmi);
      const firstUnpaidDue = new Date(commDate);
      firstUnpaidDue.setMonth(firstUnpaidDue.getMonth() + paidMonths);
      firstUnpaidDue.setHours(0, 0, 0, 0);
      const dpd = Math.floor((today.getTime() - firstUnpaidDue.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return dpd >= 90;
    });

    // Recovery: total all-time (since transactions are historical, not current-month)
    const recoveryAllTime = transactions.reduce((s, t) => {
      const b = filtered.find(b => b.id === t.beneficiary_id);
      return b ? s + Number(t.amount) : s;
    }, 0);

    return {
      totalLoans: filtered.length,
      activeLoans: active.length,
      portfolioValue: active.reduce((s, b) => s + Number(b.loan_amount), 0),
      totalOutstanding: active.reduce((s, b) => s + Number(b.outstanding_balance), 0),
      totalPaid: active.reduce((s, b) => s + Number(b.total_paid), 0),
      recoveryMTD: recoveryAllTime,
      nplCount: npl.length,
      nplRatio: active.length > 0 ? (npl.reduce((s, b) => s + Number(b.outstanding_balance), 0) / active.reduce((s, b) => s + Number(b.outstanding_balance), 0) * 100) : 0,
    };
  }, [beneficiaries, transactions, filterState]);

  // Loan portfolio by staff
  const staffPortfolio = useMemo(() => {
    return staffMetrics.map(s => ({
      staffName: `${s.title} ${s.surname} ${s.first_name}`.trim(),
      staffId: s.staff_id,
      state: s.state,
      branch: s.branch,
      designation: s.designation,
      totalLoans: s.totalLoans,
      activeLoans: s.activeLoans,
      portfolioValue: s.portfolioValue,
      totalOutstanding: s.totalOutstanding,
      totalPaid: s.totalPaid,
      nplCount: s.nplCount,
      nplRatio: s.nplRatio,
      recoveryMTD: s.recoveryMTD,
      recoveryAllTime: s.recoveryAllTime ?? 0,
      recoveryRate: s.recoveryRate,
      beneficiaries: s.beneficiaries,
    }));
  }, [staffMetrics]);

  // State-level portfolio (deduplicated from beneficiaries, not staff metrics)
  const statePortfolio = useMemo(() => {
    const filtered = filterState === 'all' ? beneficiaries : beneficiaries.filter(b => b.state === filterState);
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const map = new Map<string, { state: string; totalStaff: number; totalLoans: number; activeLoans: number; portfolioValue: number; totalOutstanding: number; totalPaid: number; nplCount: number; recoveryMTD: number; }>();
    
    // Count staff per state
    const staffByState = new Map<string, number>();
    const filteredStaff = filterState === 'all' ? staff : staff.filter(s => s.state === filterState);
    filteredStaff.forEach(s => staffByState.set(s.state, (staffByState.get(s.state) || 0) + 1));

    filtered.forEach(b => {
      const existing = map.get(b.state);
      const isActive = b.status === 'active';

      // Correct NPL: 90+ DPD using total_paid/monthly_emi (same as Dashboard & NPL module)
      const isNpl = (() => {
        if (!isActive || Number(b.outstanding_balance) <= 0) return false;
        const commDate = new Date(b.commencement_date);
        commDate.setHours(0, 0, 0, 0);
        if (today < commDate) return false;
        const monthlyEmi = Number(b.monthly_emi);
        if (monthlyEmi <= 0) return false;
        const totalPaid = Number(b.total_paid);
        let dueMonths = 0;
        for (let i = 1; i <= b.tenor_months; i++) {
          const dueDate = new Date(commDate);
          dueDate.setMonth(dueDate.getMonth() + (i - 1));
          if (today >= dueDate) dueMonths = i; else break;
        }
        if (dueMonths <= 0) return false;
        const paidMonths = Math.floor(Math.round(totalPaid * 100) / 100 / monthlyEmi);
        if (paidMonths >= dueMonths) return false;
        const firstUnpaidDue = new Date(commDate);
        firstUnpaidDue.setMonth(firstUnpaidDue.getMonth() + paidMonths);
        firstUnpaidDue.setHours(0, 0, 0, 0);
        const dpd = Math.floor((today.getTime() - firstUnpaidDue.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return dpd >= 90;
      })();

      const benTxns = transactions.filter(t => {
        if (t.beneficiary_id !== b.id) return false;
        const d = new Date(t.date_paid);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
      const benRecovery = benTxns.reduce((s, t) => s + Number(t.amount), 0);

      if (!existing) {
        map.set(b.state, {
          state: b.state,
          totalStaff: staffByState.get(b.state) || 0,
          totalLoans: 1,
          activeLoans: isActive ? 1 : 0,
          portfolioValue: isActive ? Number(b.loan_amount) : 0,
          totalOutstanding: isActive ? Number(b.outstanding_balance) : 0,
          totalPaid: isActive ? Number(b.total_paid) : 0,
          nplCount: isNpl ? 1 : 0,
          recoveryMTD: benRecovery,
        });
      } else {
        map.set(b.state, {
          ...existing,
          totalLoans: existing.totalLoans + 1,
          activeLoans: existing.activeLoans + (isActive ? 1 : 0),
          portfolioValue: existing.portfolioValue + (isActive ? Number(b.loan_amount) : 0),
          totalOutstanding: existing.totalOutstanding + (isActive ? Number(b.outstanding_balance) : 0),
          totalPaid: existing.totalPaid + (isActive ? Number(b.total_paid) : 0),
          nplCount: existing.nplCount + (isNpl ? 1 : 0),
          recoveryMTD: existing.recoveryMTD + benRecovery,
        });
      }
    });
    return [...map.values()].sort((a, b) => b.portfolioValue - a.portfolioValue);
  }, [beneficiaries, transactions, staff, filterState]);

  // Branch-level portfolio (deduplicated from beneficiaries)
  const branchPortfolio = useMemo(() => {
    const filtered = filterState === 'all' ? beneficiaries : beneficiaries.filter(b => b.state === filterState);
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const map = new Map<string, { branch: string; state: string; totalStaff: number; totalLoans: number; activeLoans: number; portfolioValue: number; totalOutstanding: number; totalPaid: number; nplCount: number; recoveryMTD: number; }>();

    // Count staff per branch
    const staffByBranch = new Map<string, number>();
    const filteredStaff = filterState === 'all' ? staff : staff.filter(s => s.state === filterState);
    filteredStaff.forEach(s => {
      const key = `${s.state}-${s.branch}`;
      staffByBranch.set(key, (staffByBranch.get(key) || 0) + 1);
    });

    filtered.forEach(b => {
      const key = `${b.state}-${b.bank_branch}`;
      const existing = map.get(key);
      const isActive = b.status === 'active';

      // Correct NPL: 90+ DPD using total_paid/monthly_emi (same as Dashboard & NPL module)
      const isNpl = (() => {
        if (!isActive || Number(b.outstanding_balance) <= 0) return false;
        const commDate = new Date(b.commencement_date);
        commDate.setHours(0, 0, 0, 0);
        if (today < commDate) return false;
        const monthlyEmi = Number(b.monthly_emi);
        if (monthlyEmi <= 0) return false;
        const totalPaid = Number(b.total_paid);
        let dueMonths = 0;
        for (let i = 1; i <= b.tenor_months; i++) {
          const dueDate = new Date(commDate);
          dueDate.setMonth(dueDate.getMonth() + (i - 1));
          if (today >= dueDate) dueMonths = i; else break;
        }
        if (dueMonths <= 0) return false;
        const paidMonths = Math.floor(Math.round(totalPaid * 100) / 100 / monthlyEmi);
        if (paidMonths >= dueMonths) return false;
        const firstUnpaidDue = new Date(commDate);
        firstUnpaidDue.setMonth(firstUnpaidDue.getMonth() + paidMonths);
        firstUnpaidDue.setHours(0, 0, 0, 0);
        const dpd = Math.floor((today.getTime() - firstUnpaidDue.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return dpd >= 90;
      })();
      const benTxns = transactions.filter(t => {
        if (t.beneficiary_id !== b.id) return false;
        const d = new Date(t.date_paid);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
      const benRecovery = benTxns.reduce((s, t) => s + Number(t.amount), 0);

      if (!existing) {
        map.set(key, {
          branch: b.bank_branch, state: b.state,
          totalStaff: staffByBranch.get(key) || 0,
          totalLoans: 1, activeLoans: isActive ? 1 : 0,
          portfolioValue: isActive ? Number(b.loan_amount) : 0,
          totalOutstanding: isActive ? Number(b.outstanding_balance) : 0,
          totalPaid: isActive ? Number(b.total_paid) : 0,
          nplCount: isNpl ? 1 : 0, recoveryMTD: benRecovery,
        });
      } else {
        map.set(key, {
          ...existing, totalLoans: existing.totalLoans + 1,
          activeLoans: existing.activeLoans + (isActive ? 1 : 0),
          portfolioValue: existing.portfolioValue + (isActive ? Number(b.loan_amount) : 0),
          totalOutstanding: existing.totalOutstanding + (isActive ? Number(b.outstanding_balance) : 0),
          totalPaid: existing.totalPaid + (isActive ? Number(b.total_paid) : 0),
          nplCount: existing.nplCount + (isNpl ? 1 : 0), recoveryMTD: existing.recoveryMTD + benRecovery,
        });
      }
    });
    return [...map.values()].sort((a, b) => b.portfolioValue - a.portfolioValue);
  }, [beneficiaries, transactions, staff, filterState]);

  const topPerformers = staffMetrics.slice(0, 3);

  // ──────── EXPORTS ────────
  const exportExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summaryData = [{
      'Total Staff': staffMetrics.length,
      'Total Loan Accounts': portfolioTotals.totalLoans,
      'Total Portfolio': portfolioTotals.portfolioValue,
      'Total Outstanding': portfolioTotals.totalOutstanding,
      'Total Paid': portfolioTotals.totalPaid,
      'Recovery MTD': portfolioTotals.recoveryMTD,
      'Total NPL Accounts': portfolioTotals.nplCount,
    }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary');

    // Sheet 2: By Staff
    const staffRows = staffPortfolio.map((s, i) => ({
      'S/N': i + 1, 'Staff Name': s.staffName, 'Staff ID': s.staffId, State: s.state, Branch: s.branch,
      Designation: s.designation, 'Total Loans': s.totalLoans, 'Active Loans': s.activeLoans,
      'Portfolio Value (₦)': s.portfolioValue, 'Outstanding (₦)': s.totalOutstanding, 'Total Paid (₦)': s.totalPaid,
      'NPL Count': s.nplCount, 'NPL Ratio (%)': s.nplRatio, 'Recovery MTD (₦)': s.recoveryMTD,
      'Recovery Rate (%)': s.recoveryRate,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(staffRows), 'By Staff');

    // Sheet 3: By State
    const stateRows = statePortfolio.map((s, i) => ({
      'S/N': i + 1, State: s.state, 'Total Staff': s.totalStaff, 'Total Loans': s.totalLoans,
      'Active Loans': s.activeLoans, 'Portfolio Value (₦)': s.portfolioValue, 'Outstanding (₦)': s.totalOutstanding,
      'Total Paid (₦)': s.totalPaid, 'NPL Count': s.nplCount,
      'NPL Ratio (%)': s.portfolioValue > 0 ? Math.round(s.nplCount / s.totalLoans * 100 * 10) / 10 : 0,
      'Recovery MTD (₦)': s.recoveryMTD,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stateRows), 'By State');

    // Sheet 4: By Branch
    const branchRows = branchPortfolio.map((b, i) => ({
      'S/N': i + 1, State: b.state, Branch: b.branch, 'Total Staff': b.totalStaff, 'Total Loans': b.totalLoans,
      'Active Loans': b.activeLoans, 'Portfolio Value (₦)': b.portfolioValue, 'Outstanding (₦)': b.totalOutstanding,
      'Total Paid (₦)': b.totalPaid, 'NPL Count': b.nplCount, 'Recovery MTD (₦)': b.recoveryMTD,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(branchRows), 'By Branch');

    // Sheet 5: Detailed Loan Accounts (deduplicated)
    const filtered = filterState === 'all' ? beneficiaries : beneficiaries.filter(b => b.state === filterState);
    const loanRows = filtered.map((b, i) => ({
      'S/N': i + 1, State: b.state, Branch: b.bank_branch,
      'Loan Ref': b.loan_reference_number || '', 'Beneficiary': b.name, 'Employee ID': b.employee_id,
      'Loan Amount (₦)': b.loan_amount, 'Outstanding (₦)': b.outstanding_balance, 'Total Paid (₦)': b.total_paid,
      'Monthly EMI (₦)': b.monthly_emi, 'Tenor': b.tenor_months, 'Rate (%)': b.interest_rate, Status: b.status,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(loanRows), 'Loan Accounts');

    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Staff_Performance_Portfolio_${filterState === 'all' ? 'All_States' : filterState}_${date}.xlsx`);
    toast({ title: 'Excel exported successfully' });
  }, [staffMetrics, staffPortfolio, statePortfolio, branchPortfolio, filterState, toast]);

  const exportPDF = useCallback(() => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    const date = new Date().toISOString().split('T')[0];
    const title = `Staff Performance & Loan Portfolio Report${filterState !== 'all' ? ` – ${filterState}` : ''}`;
    
    doc.setFontSize(16);
    doc.text(title, 40, 35);
    doc.setFontSize(9);
    doc.text(`Generated: ${date}`, 40, 50);

    // Summary
    const totalPortfolio = portfolioTotals.portfolioValue;
    const totalOutstanding = portfolioTotals.totalOutstanding;
    const totalPaid = portfolioTotals.totalPaid;
    const totalRecovery = portfolioTotals.recoveryMTD;
    
    autoTable(doc, {
      startY: 60,
      head: [['Total Staff', 'Total Portfolio', 'Total Outstanding', 'Total Paid', 'Recovery MTD']],
      body: [[staffMetrics.length, formatNairaFull(totalPortfolio), formatNairaFull(totalOutstanding), formatNairaFull(totalPaid), formatNairaFull(totalRecovery)]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 100, 60] },
    });

    // Staff Performance Table
    let y = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(12);
    doc.text('Staff Portfolio Performance', 40, y);
    
    autoTable(doc, {
      startY: y + 10,
      head: [['S/N', 'Staff Name', 'Staff ID', 'State', 'Branch', 'Total Loans', 'Active', 'Portfolio (₦)', 'Outstanding (₦)', 'Paid (₦)', 'NPL', 'NPL %', 'Recovery MTD']],
      body: staffPortfolio.map((s, i) => [
        i + 1, s.staffName, s.staffId, s.state, s.branch, s.totalLoans, s.activeLoans,
        formatNairaFull(s.portfolioValue), formatNairaFull(s.totalOutstanding), formatNairaFull(s.totalPaid),
        s.nplCount, `${s.nplRatio}%`, formatNairaFull(s.recoveryMTD),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 100, 60] },
    });

    // State Summary
    y = (doc as any).lastAutoTable.finalY + 20;
    if (y > 500) { doc.addPage(); y = 40; }
    doc.setFontSize(12);
    doc.text('Portfolio by State', 40, y);
    
    autoTable(doc, {
      startY: y + 10,
      head: [['S/N', 'State', 'Staff', 'Loans', 'Active', 'Portfolio (₦)', 'Outstanding (₦)', 'Paid (₦)', 'NPL', 'Recovery MTD']],
      body: statePortfolio.map((s, i) => [
        i + 1, s.state, s.totalStaff, s.totalLoans, s.activeLoans,
        formatNairaFull(s.portfolioValue), formatNairaFull(s.totalOutstanding), formatNairaFull(s.totalPaid),
        s.nplCount, formatNairaFull(s.recoveryMTD),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 100, 60] },
    });

    // Branch Summary
    y = (doc as any).lastAutoTable.finalY + 20;
    if (y > 500) { doc.addPage(); y = 40; }
    doc.setFontSize(12);
    doc.text('Portfolio by Branch', 40, y);
    
    autoTable(doc, {
      startY: y + 10,
      head: [['S/N', 'State', 'Branch', 'Staff', 'Loans', 'Active', 'Portfolio (₦)', 'Outstanding (₦)', 'Paid (₦)', 'NPL', 'Recovery MTD']],
      body: branchPortfolio.map((b, i) => [
        i + 1, b.state, b.branch, b.totalStaff, b.totalLoans, b.activeLoans,
        formatNairaFull(b.portfolioValue), formatNairaFull(b.totalOutstanding), formatNairaFull(b.totalPaid),
        b.nplCount, formatNairaFull(b.recoveryMTD),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 100, 60] },
    });

    doc.save(`Staff_Performance_Portfolio_${filterState === 'all' ? 'All_States' : filterState}_${date}.pdf`);
    toast({ title: 'PDF exported successfully' });
  }, [staffMetrics, staffPortfolio, statePortfolio, branchPortfolio, filterState, toast]);

  const handlePrint = useCallback(() => {
    const totalPortfolio = portfolioTotals.portfolioValue;
    const totalOutstanding = portfolioTotals.totalOutstanding;
    const totalPaid = portfolioTotals.totalPaid;
    const totalRecovery = portfolioTotals.recoveryMTD;
    const date = new Date().toISOString().split('T')[0];

    const html = `<html><head><title>Staff Performance Report</title><style>
      body{font-family:Arial,sans-serif;padding:20px;font-size:11px}
      h1{font-size:16px;margin-bottom:4px}h2{font-size:13px;margin-top:16px;border-bottom:2px solid #006440;padding-bottom:4px}
      .summary{display:flex;gap:20px;margin:10px 0}.summary div{background:#f0f9f4;padding:8px 14px;border-radius:6px}
      .summary .label{font-size:10px;color:#666}.summary .value{font-size:14px;font-weight:bold;color:#006440}
      table{width:100%;border-collapse:collapse;margin-top:8px;page-break-inside:auto}
      th{background:#006440;color:white;padding:5px 6px;text-align:left;font-size:10px}
      td{padding:4px 6px;border:1px solid #ddd;font-size:10px}
      tr:nth-child(even){background:#f9f9f9}
      .text-right{text-align:right}.font-bold{font-weight:bold}
      @media print{.no-print{display:none}}
    </style></head><body>
    <h1>Staff Performance & Loan Portfolio Report${filterState !== 'all' ? ` – ${filterState}` : ''}</h1>
    <p style="color:#666;margin:0">Generated: ${date}</p>
    <div class="summary">
      <div><div class="label">Total Staff</div><div class="value">${staffMetrics.length}</div></div>
      <div><div class="label">Total Portfolio</div><div class="value">${formatNairaFull(totalPortfolio)}</div></div>
      <div><div class="label">Outstanding</div><div class="value">${formatNairaFull(totalOutstanding)}</div></div>
      <div><div class="label">Total Paid</div><div class="value">${formatNairaFull(totalPaid)}</div></div>
      <div><div class="label">Recovery MTD</div><div class="value">${formatNairaFull(totalRecovery)}</div></div>
    </div>
    <h2>Staff Portfolio Performance</h2>
    <table><tr><th>S/N</th><th>Staff Name</th><th>Staff ID</th><th>State</th><th>Branch</th><th>Total Loans</th><th>Active</th><th>Portfolio (₦)</th><th>Outstanding (₦)</th><th>Paid (₦)</th><th>NPL</th><th>NPL %</th><th>Recovery MTD</th></tr>
    ${staffPortfolio.map((s, i) => `<tr><td>${i + 1}</td><td>${s.staffName}</td><td>${s.staffId}</td><td>${s.state}</td><td>${s.branch}</td><td>${s.totalLoans}</td><td>${s.activeLoans}</td><td class="text-right">${formatNairaFull(s.portfolioValue)}</td><td class="text-right">${formatNairaFull(s.totalOutstanding)}</td><td class="text-right">${formatNairaFull(s.totalPaid)}</td><td>${s.nplCount}</td><td>${s.nplRatio}%</td><td class="text-right">${formatNairaFull(s.recoveryMTD)}</td></tr>`).join('')}
    </table>
    <h2>Portfolio by State</h2>
    <table><tr><th>S/N</th><th>State</th><th>Staff</th><th>Loans</th><th>Active</th><th>Portfolio (₦)</th><th>Outstanding (₦)</th><th>Paid (₦)</th><th>NPL</th><th>Recovery MTD</th></tr>
    ${statePortfolio.map((s, i) => `<tr><td>${i + 1}</td><td>${s.state}</td><td>${s.totalStaff}</td><td>${s.totalLoans}</td><td>${s.activeLoans}</td><td class="text-right">${formatNairaFull(s.portfolioValue)}</td><td class="text-right">${formatNairaFull(s.totalOutstanding)}</td><td class="text-right">${formatNairaFull(s.totalPaid)}</td><td>${s.nplCount}</td><td class="text-right">${formatNairaFull(s.recoveryMTD)}</td></tr>`).join('')}
    </table>
    <h2>Portfolio by Branch</h2>
    <table><tr><th>S/N</th><th>State</th><th>Branch</th><th>Staff</th><th>Loans</th><th>Active</th><th>Portfolio (₦)</th><th>Outstanding (₦)</th><th>Paid (₦)</th><th>NPL</th><th>Recovery MTD</th></tr>
    ${branchPortfolio.map((b, i) => `<tr><td>${i + 1}</td><td>${b.state}</td><td>${b.branch}</td><td>${b.totalStaff}</td><td>${b.totalLoans}</td><td>${b.activeLoans}</td><td class="text-right">${formatNairaFull(b.portfolioValue)}</td><td class="text-right">${formatNairaFull(b.totalOutstanding)}</td><td class="text-right">${formatNairaFull(b.totalPaid)}</td><td>${b.nplCount}</td><td class="text-right">${formatNairaFull(b.recoveryMTD)}</td></tr>`).join('')}
    </table>
    </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  }, [staffMetrics, staffPortfolio, statePortfolio, branchPortfolio, filterState]);

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading performance data…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" /> Staff Performance & Loan Portfolio</h1>
          <p className="text-sm text-muted-foreground">Live metrics computed from loan & transaction data</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by Staff ID, Name or NHF..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
          <Select value={filterState} onValueChange={setFilterState}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Filter by State" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <DateRangeFilter fromDate={fromDate} toDate={toDate} onFromDateChange={setFromDate} onToDateChange={setToDate} />
          <Button size="sm" variant="outline" onClick={exportExcel}><Download className="w-4 h-4 mr-1" />Excel</Button>
          <Button size="sm" variant="outline" onClick={exportPDF}><Download className="w-4 h-4 mr-1" />PDF</Button>
          <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" />Print</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Total Staff</div><div className="text-2xl font-bold">{staffMetrics.length}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Total Portfolio</div><div className="text-2xl font-bold">{formatNaira(portfolioTotals.portfolioValue)}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Total Outstanding</div><div className="text-2xl font-bold text-warning">{formatNaira(portfolioTotals.totalOutstanding)}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Total Recovery (All-Time)</div><div className="text-2xl font-bold text-success">{formatNaira(portfolioTotals.recoveryMTD)}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">NPL Ratio</div><div className="text-2xl font-bold">{portfolioTotals.nplRatio.toFixed(1)}%</div></CardContent></Card>
      </div>

      {/* Top Performers */}
      {topPerformers.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Award className="w-5 h-5 text-primary" /> Top Performers – Reward Recommendations</CardTitle>
            <p className="text-xs text-muted-foreground">Ranked by Total Loan Recovery (All-Time) recorded by individual staff</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topPerformers.map((p, i) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <Badge variant={i === 0 ? 'default' : 'secondary'}>{i + 1}{i === 0 ? 'st' : i === 1 ? 'nd' : 'rd'}</Badge>
                  <span className="font-medium">{p.title} {p.surname} {p.first_name}</span>
                  <span className="text-muted-foreground">({p.branch}, {p.state})</span>
                  <span className="text-success font-semibold">{formatNaira(p.recoveryAllTime ?? 0)} total recovered</span>
                  {(p.recoveryMTD ?? 0) > 0 && (
                    <span className="text-muted-foreground">| MTD: {formatNaira(p.recoveryMTD)}</span>
                  )}
                  <span className="text-muted-foreground">| {p.activeLoans} active loans | Portfolio: {formatNaira(p.portfolioValue)}</span>
                  {i === 0 && <Badge className="bg-primary/10 text-primary border-primary/30">★ Recommended for Reward</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabbed Views */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview Charts</TabsTrigger>
          <TabsTrigger value="by-staff">By Staff</TabsTrigger>
          <TabsTrigger value="by-state">By State</TabsTrigger>
          <TabsTrigger value="by-branch">By Branch</TabsTrigger>
          <TabsTrigger value="loan-accounts">Loan Accounts</TabsTrigger>
        </TabsList>

        {/* Overview Charts */}
        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Total Recovery by Staff (Top 10 – All Time)</CardTitle>
                <p className="text-xs text-muted-foreground">All repayments recorded by each staff member</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={staffMetrics.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="surname" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => formatNaira(v)} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => formatNaira(v)} labelFormatter={(label) => `Staff: ${label}`} />
                    <Bar dataKey="recoveryAllTime" fill="hsl(var(--primary))" name="Total Recovery (All-Time)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Portfolio Value by Staff (Top 10)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={staffMetrics.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="surname" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => formatNaira(v)} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => formatNaira(v)} />
                    <Bar dataKey="portfolioValue" fill="hsl(var(--chart-2))" name="Portfolio Value" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* By Staff */}
        <TabsContent value="by-staff">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Staff Loan Portfolio</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[65vh]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10"><tr>
                    {['S/N', 'Staff Name', 'Staff ID', 'State', 'Branch', 'Designation', 'Total Loans', 'Active', 'Portfolio (₦)', 'Outstanding (₦)', 'Paid (₦)', 'NPL', 'NPL %', 'Total Recovery (All-Time)', 'Recovery Rate'].map(h => <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {staffPortfolio.map((s, i) => (
                      <tr key={i} className="border-b table-row-highlight">
                        <td className="px-3 py-2 font-bold">{i + 1}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-medium">{s.staffName}</td>
                        <td className="px-3 py-2 font-mono text-xs">{s.staffId}</td>
                        <td className="px-3 py-2">{s.state}</td>
                        <td className="px-3 py-2">{s.branch}</td>
                        <td className="px-3 py-2">{s.designation}</td>
                        <td className="px-3 py-2">{s.totalLoans}</td>
                        <td className="px-3 py-2">{s.activeLoans}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatNaira(s.portfolioValue)}</td>
                        <td className="px-3 py-2 text-right text-warning">{formatNaira(s.totalOutstanding)}</td>
                        <td className="px-3 py-2 text-right text-success">{formatNaira(s.totalPaid)}</td>
                        <td className="px-3 py-2">{s.nplCount}</td>
                        <td className="px-3 py-2">{s.nplRatio}%</td>
                        <td className="px-3 py-2 text-right text-success font-semibold">{formatNaira(s.recoveryAllTime)}</td>
                        <td className="px-3 py-2">{s.recoveryRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* By State */}
        <TabsContent value="by-state">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="w-4 h-4" /> State-Level Loan Portfolio</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[65vh]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10"><tr>
                    {['S/N', 'State', 'Staff Count', 'Total Loans', 'Active Loans', 'Portfolio (₦)', 'Outstanding (₦)', 'Paid (₦)', 'NPL Count', 'NPL Ratio', 'Recovery MTD'].map(h => <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {statePortfolio.map((s, i) => (
                      <tr key={s.state} className="border-b table-row-highlight">
                        <td className="px-3 py-2 font-bold">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{s.state}</td>
                        <td className="px-3 py-2">{s.totalStaff}</td>
                        <td className="px-3 py-2">{s.totalLoans}</td>
                        <td className="px-3 py-2">{s.activeLoans}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatNaira(s.portfolioValue)}</td>
                        <td className="px-3 py-2 text-right text-warning">{formatNaira(s.totalOutstanding)}</td>
                        <td className="px-3 py-2 text-right text-success">{formatNaira(s.totalPaid)}</td>
                        <td className="px-3 py-2">{s.nplCount}</td>
                        <td className="px-3 py-2">{s.portfolioValue > 0 ? (s.nplCount / s.totalLoans * 100).toFixed(1) : 0}%</td>
                        <td className="px-3 py-2 text-right text-success font-medium">{formatNaira(s.recoveryMTD)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Branch */}
        <TabsContent value="by-branch">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="w-4 h-4" /> Branch-Level Loan Portfolio</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[65vh]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10"><tr>
                    {['S/N', 'State', 'Branch', 'Staff', 'Total Loans', 'Active', 'Portfolio (₦)', 'Outstanding (₦)', 'Paid (₦)', 'NPL Count', 'Recovery MTD'].map(h => <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {branchPortfolio.map((b, i) => (
                      <tr key={`${b.state}-${b.branch}`} className="border-b table-row-highlight">
                        <td className="px-3 py-2 font-bold">{i + 1}</td>
                        <td className="px-3 py-2">{b.state}</td>
                        <td className="px-3 py-2 font-medium">{b.branch}</td>
                        <td className="px-3 py-2">{b.totalStaff}</td>
                        <td className="px-3 py-2">{b.totalLoans}</td>
                        <td className="px-3 py-2">{b.activeLoans}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatNaira(b.portfolioValue)}</td>
                        <td className="px-3 py-2 text-right text-warning">{formatNaira(b.totalOutstanding)}</td>
                        <td className="px-3 py-2 text-right text-success">{formatNaira(b.totalPaid)}</td>
                        <td className="px-3 py-2">{b.nplCount}</td>
                        <td className="px-3 py-2 text-right text-success font-medium">{formatNaira(b.recoveryMTD)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Detailed Loan Accounts (deduplicated) */}
        <TabsContent value="loan-accounts">
          <Card>
            <CardHeader><CardTitle className="text-base">Detailed Loan Accounts ({(filterState === 'all' ? beneficiaries : beneficiaries.filter(b => b.state === filterState)).length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[65vh]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10"><tr>
                    {['S/N', 'Loan Ref', 'Beneficiary', 'Employee ID', 'State', 'Branch', 'Loan Amount (₦)', 'Outstanding (₦)', 'Paid (₦)', 'Monthly EMI', 'Tenor', 'Status'].map(h => <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {(filterState === 'all' ? beneficiaries : beneficiaries.filter(b => b.state === filterState)).map((b, i) => (
                      <tr key={b.id} className="border-b table-row-highlight">
                        <td className="px-3 py-2">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs">{b.loan_reference_number || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-medium">{b.name}</td>
                        <td className="px-3 py-2 font-mono text-xs">{b.employee_id}</td>
                        <td className="px-3 py-2">{b.state}</td>
                        <td className="px-3 py-2">{b.bank_branch}</td>
                        <td className="px-3 py-2 text-right">{formatNaira(Number(b.loan_amount))}</td>
                        <td className="px-3 py-2 text-right text-warning">{formatNaira(Number(b.outstanding_balance))}</td>
                        <td className="px-3 py-2 text-right text-success">{formatNaira(Number(b.total_paid))}</td>
                        <td className="px-3 py-2 text-right">{formatNaira(Number(b.monthly_emi))}</td>
                        <td className="px-3 py-2">{b.tenor_months}m</td>
                        <td className="px-3 py-2">
                          <Badge variant={b.status === 'active' ? 'default' : 'secondary'} className="text-xs">{b.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
