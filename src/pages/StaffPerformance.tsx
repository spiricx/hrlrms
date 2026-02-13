import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, Award, Target, BarChart3, Download, Printer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

type StaffMember = { id: string; title: string; surname: string; first_name: string; staff_id: string; state: string; branch: string; designation: string; email: string; status: string; };
type Beneficiary = { id: string; state: string; bank_branch: string; status: string; loan_amount: number; outstanding_balance: number; total_paid: number; monthly_emi: number; created_by: string | null; name: string; employee_id: string; tenor_months: number; interest_rate: number; commencement_date: string; termination_date: string; loan_reference_number: string | null; };
type Transaction = { id: string; beneficiary_id: string; amount: number; date_paid: string; recorded_by: string | null; };

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
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    (async () => {
      const [s, b, t] = await Promise.all([
        supabase.from('staff_members').select('id,title,surname,first_name,staff_id,state,branch,designation,email,status'),
        supabase.from('beneficiaries').select('id,state,bank_branch,status,loan_amount,outstanding_balance,total_paid,monthly_emi,created_by,name,employee_id,tenor_months,interest_rate,commencement_date,termination_date,loan_reference_number'),
        supabase.from('transactions').select('id,beneficiary_id,amount,date_paid,recorded_by'),
      ]);
      setStaff((s.data as any[]) || []);
      setBeneficiaries((b.data as any[]) || []);
      setTransactions((t.data as any[]) || []);
      setLoading(false);
    })();
  }, []);

  const staffMetrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return staff.filter(s => filterState === 'all' || s.state === filterState).map(s => {
      const myBeneficiaries = beneficiaries.filter(b => b.state === s.state && b.bank_branch === s.branch);
      const activeBens = myBeneficiaries.filter(b => b.status === 'active');
      const nplBens = myBeneficiaries.filter(b => b.outstanding_balance > 0 && b.status === 'active' && b.total_paid < b.monthly_emi * 3);
      const portfolioValue = activeBens.reduce((sum, b) => sum + Number(b.loan_amount), 0);
      const totalOutstanding = activeBens.reduce((sum, b) => sum + Number(b.outstanding_balance), 0);
      const totalPaid = activeBens.reduce((sum, b) => sum + Number(b.total_paid), 0);

      const benIds = new Set(myBeneficiaries.map(b => b.id));
      const monthTxns = transactions.filter(t => {
        if (!benIds.has(t.beneficiary_id)) return false;
        const d = new Date(t.date_paid);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
      const recoveryMTD = monthTxns.reduce((sum, t) => sum + Number(t.amount), 0);
      const nplRatio = portfolioValue > 0 ? (nplBens.reduce((s, b) => s + Number(b.outstanding_balance), 0) / portfolioValue * 100) : 0;
      const recoveryRate = totalOutstanding > 0 ? (recoveryMTD / (activeBens.reduce((s, b) => s + Number(b.monthly_emi), 0) || 1) * 100) : 0;

      return {
        ...s,
        totalLoans: myBeneficiaries.length,
        activeLoans: activeBens.length,
        portfolioValue,
        totalOutstanding,
        totalPaid,
        recoveryMTD,
        nplCount: nplBens.length,
        nplRatio: Math.round(nplRatio * 10) / 10,
        recoveryRate: Math.min(Math.round(recoveryRate), 200),
        beneficiaries: myBeneficiaries,
      };
    }).sort((a, b) => b.recoveryMTD - a.recoveryMTD);
  }, [staff, beneficiaries, transactions, filterState]);

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
      recoveryRate: s.recoveryRate,
      beneficiaries: s.beneficiaries,
    }));
  }, [staffMetrics]);

  // State-level portfolio
  const statePortfolio = useMemo(() => {
    const map = new Map<string, { state: string; totalStaff: number; totalLoans: number; activeLoans: number; portfolioValue: number; totalOutstanding: number; totalPaid: number; nplCount: number; recoveryMTD: number; }>();
    staffMetrics.forEach(s => {
      const existing = map.get(s.state);
      if (!existing) {
        map.set(s.state, { state: s.state, totalStaff: 1, totalLoans: s.totalLoans, activeLoans: s.activeLoans, portfolioValue: s.portfolioValue, totalOutstanding: s.totalOutstanding, totalPaid: s.totalPaid, nplCount: s.nplCount, recoveryMTD: s.recoveryMTD });
      } else {
        map.set(s.state, { ...existing, totalStaff: existing.totalStaff + 1, totalLoans: existing.totalLoans + s.totalLoans, activeLoans: existing.activeLoans + s.activeLoans, portfolioValue: existing.portfolioValue + s.portfolioValue, totalOutstanding: existing.totalOutstanding + s.totalOutstanding, totalPaid: existing.totalPaid + s.totalPaid, nplCount: existing.nplCount + s.nplCount, recoveryMTD: existing.recoveryMTD + s.recoveryMTD });
      }
    });
    return [...map.values()].sort((a, b) => b.portfolioValue - a.portfolioValue);
  }, [staffMetrics]);

  // Branch-level portfolio
  const branchPortfolio = useMemo(() => {
    const map = new Map<string, { branch: string; state: string; totalStaff: number; totalLoans: number; activeLoans: number; portfolioValue: number; totalOutstanding: number; totalPaid: number; nplCount: number; recoveryMTD: number; }>();
    staffMetrics.forEach(s => {
      const key = `${s.state}-${s.branch}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { branch: s.branch, state: s.state, totalStaff: 1, totalLoans: s.totalLoans, activeLoans: s.activeLoans, portfolioValue: s.portfolioValue, totalOutstanding: s.totalOutstanding, totalPaid: s.totalPaid, nplCount: s.nplCount, recoveryMTD: s.recoveryMTD });
      } else {
        map.set(key, { ...existing, totalStaff: existing.totalStaff + 1, totalLoans: existing.totalLoans + s.totalLoans, activeLoans: existing.activeLoans + s.activeLoans, portfolioValue: existing.portfolioValue + s.portfolioValue, totalOutstanding: existing.totalOutstanding + s.totalOutstanding, totalPaid: existing.totalPaid + s.totalPaid, nplCount: existing.nplCount + s.nplCount, recoveryMTD: existing.recoveryMTD + s.recoveryMTD });
      }
    });
    return [...map.values()].sort((a, b) => b.portfolioValue - a.portfolioValue);
  }, [staffMetrics]);

  const topPerformers = staffMetrics.slice(0, 3);

  // ──────── EXPORTS ────────
  const exportExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summaryData = [{
      'Total Staff': staffMetrics.length,
      'Total Portfolio': staffMetrics.reduce((s, m) => s + m.portfolioValue, 0),
      'Total Outstanding': staffMetrics.reduce((s, m) => s + m.totalOutstanding, 0),
      'Total Paid': staffMetrics.reduce((s, m) => s + m.totalPaid, 0),
      'Recovery MTD': staffMetrics.reduce((s, m) => s + m.recoveryMTD, 0),
      'Total NPL Accounts': staffMetrics.reduce((s, m) => s + m.nplCount, 0),
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

    // Sheet 5: Detailed Loan Accounts
    const loanRows = staffPortfolio.flatMap(s =>
      s.beneficiaries.map((b, i) => ({
        'Staff Name': s.staffName, 'Staff ID': s.staffId, State: b.state, Branch: b.bank_branch,
        'Loan Ref': b.loan_reference_number || '', 'Beneficiary': b.name, 'Employee ID': b.employee_id,
        'Loan Amount (₦)': b.loan_amount, 'Outstanding (₦)': b.outstanding_balance, 'Total Paid (₦)': b.total_paid,
        'Monthly EMI (₦)': b.monthly_emi, 'Tenor': b.tenor_months, 'Rate (%)': b.interest_rate, Status: b.status,
      }))
    );
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
    const totalPortfolio = staffMetrics.reduce((s, m) => s + m.portfolioValue, 0);
    const totalOutstanding = staffMetrics.reduce((s, m) => s + m.totalOutstanding, 0);
    const totalPaid = staffMetrics.reduce((s, m) => s + m.totalPaid, 0);
    const totalRecovery = staffMetrics.reduce((s, m) => s + m.recoveryMTD, 0);
    
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
    const totalPortfolio = staffMetrics.reduce((s, m) => s + m.portfolioValue, 0);
    const totalOutstanding = staffMetrics.reduce((s, m) => s + m.totalOutstanding, 0);
    const totalPaid = staffMetrics.reduce((s, m) => s + m.totalPaid, 0);
    const totalRecovery = staffMetrics.reduce((s, m) => s + m.recoveryMTD, 0);
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
          <Select value={filterState} onValueChange={setFilterState}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Filter by State" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={exportExcel}><Download className="w-4 h-4 mr-1" />Excel</Button>
          <Button size="sm" variant="outline" onClick={exportPDF}><Download className="w-4 h-4 mr-1" />PDF</Button>
          <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" />Print</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Total Staff</div><div className="text-2xl font-bold">{staffMetrics.length}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Total Portfolio</div><div className="text-2xl font-bold">{formatNaira(staffMetrics.reduce((s, m) => s + m.portfolioValue, 0))}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Total Outstanding</div><div className="text-2xl font-bold text-amber-600">{formatNaira(staffMetrics.reduce((s, m) => s + m.totalOutstanding, 0))}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Recovery (MTD)</div><div className="text-2xl font-bold text-emerald-600">{formatNaira(staffMetrics.reduce((s, m) => s + m.recoveryMTD, 0))}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Avg NPL Ratio</div><div className="text-2xl font-bold">{staffMetrics.length ? (staffMetrics.reduce((s, m) => s + m.nplRatio, 0) / staffMetrics.length).toFixed(1) : 0}%</div></CardContent></Card>
      </div>

      {/* Top Performers */}
      {topPerformers.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Award className="w-5 h-5 text-primary" /> Top Performers – Reward Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topPerformers.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 text-sm">
                  <Badge variant={i === 0 ? 'default' : 'secondary'}>{i + 1}{i === 0 ? 'st' : i === 1 ? 'nd' : 'rd'}</Badge>
                  <span className="font-medium">{p.title} {p.surname} {p.first_name}</span>
                  <span className="text-muted-foreground">({p.branch})</span>
                  <span className="text-emerald-600 font-medium">{formatNaira(p.recoveryMTD)} recovered</span>
                  <span className="text-muted-foreground">| {p.activeLoans} active loans | Portfolio: {formatNaira(p.portfolioValue)}</span>
                  {i === 0 && <Badge className="bg-amber-100 text-amber-700">★ Recommended for Bonus</Badge>}
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
              <CardHeader><CardTitle className="text-base">Recovery by Staff (Top 10)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={staffMetrics.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="surname" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => formatNaira(v)} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => formatNaira(v)} />
                    <Bar dataKey="recoveryMTD" fill="hsl(var(--primary))" name="Recovery (MTD)" radius={[4, 4, 0, 0]} />
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
                    {['S/N', 'Staff Name', 'Staff ID', 'State', 'Branch', 'Designation', 'Total Loans', 'Active', 'Portfolio (₦)', 'Outstanding (₦)', 'Paid (₦)', 'NPL', 'NPL %', 'Recovery MTD', 'Recovery Rate'].map(h => <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {staffPortfolio.map((s, i) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="px-3 py-2 font-bold">{i + 1}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-medium">{s.staffName}</td>
                        <td className="px-3 py-2 font-mono text-xs">{s.staffId}</td>
                        <td className="px-3 py-2">{s.state}</td>
                        <td className="px-3 py-2">{s.branch}</td>
                        <td className="px-3 py-2">{s.designation}</td>
                        <td className="px-3 py-2">{s.totalLoans}</td>
                        <td className="px-3 py-2">{s.activeLoans}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatNaira(s.portfolioValue)}</td>
                        <td className="px-3 py-2 text-right text-amber-600">{formatNaira(s.totalOutstanding)}</td>
                        <td className="px-3 py-2 text-right text-emerald-600">{formatNaira(s.totalPaid)}</td>
                        <td className="px-3 py-2">{s.nplCount}</td>
                        <td className="px-3 py-2">{s.nplRatio}%</td>
                        <td className="px-3 py-2 text-right text-emerald-600 font-medium">{formatNaira(s.recoveryMTD)}</td>
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
                      <tr key={s.state} className="border-b hover:bg-muted/30">
                        <td className="px-3 py-2 font-bold">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{s.state}</td>
                        <td className="px-3 py-2">{s.totalStaff}</td>
                        <td className="px-3 py-2">{s.totalLoans}</td>
                        <td className="px-3 py-2">{s.activeLoans}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatNaira(s.portfolioValue)}</td>
                        <td className="px-3 py-2 text-right text-amber-600">{formatNaira(s.totalOutstanding)}</td>
                        <td className="px-3 py-2 text-right text-emerald-600">{formatNaira(s.totalPaid)}</td>
                        <td className="px-3 py-2">{s.nplCount}</td>
                        <td className="px-3 py-2">{s.portfolioValue > 0 ? (s.nplCount / s.totalLoans * 100).toFixed(1) : 0}%</td>
                        <td className="px-3 py-2 text-right text-emerald-600 font-medium">{formatNaira(s.recoveryMTD)}</td>
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
                      <tr key={`${b.state}-${b.branch}`} className="border-b hover:bg-muted/30">
                        <td className="px-3 py-2 font-bold">{i + 1}</td>
                        <td className="px-3 py-2">{b.state}</td>
                        <td className="px-3 py-2 font-medium">{b.branch}</td>
                        <td className="px-3 py-2">{b.totalStaff}</td>
                        <td className="px-3 py-2">{b.totalLoans}</td>
                        <td className="px-3 py-2">{b.activeLoans}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatNaira(b.portfolioValue)}</td>
                        <td className="px-3 py-2 text-right text-amber-600">{formatNaira(b.totalOutstanding)}</td>
                        <td className="px-3 py-2 text-right text-emerald-600">{formatNaira(b.totalPaid)}</td>
                        <td className="px-3 py-2">{b.nplCount}</td>
                        <td className="px-3 py-2 text-right text-emerald-600 font-medium">{formatNaira(b.recoveryMTD)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Detailed Loan Accounts */}
        <TabsContent value="loan-accounts">
          <Card>
            <CardHeader><CardTitle className="text-base">Detailed Loan Accounts by Staff</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[65vh]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10"><tr>
                    {['S/N', 'Staff Name', 'Staff ID', 'Loan Ref', 'Beneficiary', 'State', 'Branch', 'Loan Amount (₦)', 'Outstanding (₦)', 'Paid (₦)', 'Monthly EMI', 'Tenor', 'Status'].map(h => <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {(() => {
                      let idx = 0;
                      return staffPortfolio.flatMap(s =>
                        s.beneficiaries.map(b => {
                          idx++;
                          return (
                            <tr key={b.id} className="border-b hover:bg-muted/30">
                              <td className="px-3 py-2">{idx}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{s.staffName}</td>
                              <td className="px-3 py-2 font-mono text-xs">{s.staffId}</td>
                              <td className="px-3 py-2 font-mono text-xs">{b.loan_reference_number || '—'}</td>
                              <td className="px-3 py-2 whitespace-nowrap font-medium">{b.name}</td>
                              <td className="px-3 py-2">{b.state}</td>
                              <td className="px-3 py-2">{b.bank_branch}</td>
                              <td className="px-3 py-2 text-right">{formatNaira(Number(b.loan_amount))}</td>
                              <td className="px-3 py-2 text-right text-amber-600">{formatNaira(Number(b.outstanding_balance))}</td>
                              <td className="px-3 py-2 text-right text-emerald-600">{formatNaira(Number(b.total_paid))}</td>
                              <td className="px-3 py-2 text-right">{formatNaira(Number(b.monthly_emi))}</td>
                              <td className="px-3 py-2">{b.tenor_months}m</td>
                              <td className="px-3 py-2">
                                <Badge variant={b.status === 'active' ? 'default' : 'secondary'} className="text-xs">{b.status}</Badge>
                              </td>
                            </tr>
                          );
                        })
                      );
                    })()}
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
