import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Search, Download, Printer, Users, Banknote, TrendingUp, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import DateRangeFilter from '@/components/DateRangeFilter';

type Profile = {
  user_id: string;
  surname: string;
  first_name: string;
  other_names: string;
  staff_id_no: string;
  state: string;
  bank_branch: string;
  email: string;
};

type Beneficiary = {
  id: string;
  name: string;
  employee_id: string;
  loan_amount: number;
  outstanding_balance: number;
  total_paid: number;
  monthly_emi: number;
  tenor_months: number;
  interest_rate: number;
  status: string;
  state: string;
  bank_branch: string;
  created_by: string | null;
  created_at: string;
  commencement_date: string;
  termination_date: string;
  loan_reference_number: string | null;
  surname: string | null;
  first_name: string | null;
};

function formatNaira(n: number) {
  return `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNairaShort(n: number) {
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `₦${(n / 1e3).toFixed(0)}K`;
  return `₦${n.toLocaleString()}`;
}


export default function StaffLoanTracker() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterState, setFilterState] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();

  // Expanded staff
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const [p, b] = await Promise.all([
        supabase.from('profiles').select('user_id,surname,first_name,other_names,staff_id_no,state,bank_branch,email'),
        supabase.from('beneficiaries').select('id,name,employee_id,loan_amount,outstanding_balance,total_paid,monthly_emi,tenor_months,interest_rate,status,state,bank_branch,created_by,created_at,commencement_date,termination_date,loan_reference_number,surname,first_name'),
      ]);
      setProfiles((p.data as any[]) || []);
      setBeneficiaries((b.data as any[]) || []);
      setLoading(false);
    })();
  }, []);

  // Unique branches for selected state
  const branches = useMemo(() => {
    const set = new Set<string>();
    beneficiaries.forEach(b => {
      if (filterState === 'all' || b.state === filterState) {
        if (b.bank_branch) set.add(b.bank_branch);
      }
    });
    profiles.forEach(p => {
      if (filterState === 'all' || p.state === filterState) {
        if (p.bank_branch) set.add(p.bank_branch);
      }
    });
    return [...set].sort();
  }, [beneficiaries, profiles, filterState]);

  // Available years
  const years = useMemo(() => {
    const set = new Set<number>();
    beneficiaries.forEach(b => {
      const y = new Date(b.created_at).getFullYear();
      if (!isNaN(y)) set.add(y);
    });
    return [...set].sort((a, b) => b - a);
  }, [beneficiaries]);

  // Build staff → loans map with filters
  const staffLoanData = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    // Date range filter
    const filteredBens = beneficiaries.filter(b => {
      if (filterState !== 'all' && b.state !== filterState) return false;
      if (filterBranch !== 'all' && b.bank_branch !== filterBranch) return false;
      if (!b.created_by) return false;
      const createdAt = new Date(b.created_at);
      if (fromDate && createdAt < fromDate) return false;
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        if (createdAt > endOfDay) return false;
      }
      return true;
    });

    // Group by created_by
    const map = new Map<string, Beneficiary[]>();
    filteredBens.forEach(b => {
      const key = b.created_by!;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    });

    // Build staff entries
    const result = [...map.entries()].map(([userId, loans]) => {
      const profile = profiles.find(p => p.user_id === userId);
      const staffName = profile
        ? `${profile.surname}, ${profile.first_name} ${profile.other_names || ''}`.trim()
        : 'Unknown Staff';
      const staffId = profile?.staff_id_no || 'N/A';
      const staffState = profile?.state || loans[0]?.state || '';
      const staffBranch = profile?.bank_branch || loans[0]?.bank_branch || '';

      const totalDisbursed = loans.reduce((s, l) => s + Number(l.loan_amount), 0);
      const totalOutstanding = loans.reduce((s, l) => s + Number(l.outstanding_balance), 0);
      const totalPaid = loans.reduce((s, l) => s + Number(l.total_paid), 0);
      const activeLoans = loans.filter(l => l.status === 'active').length;
      const completedLoans = loans.filter(l => l.status === 'completed').length;

      return {
        userId,
        staffName,
        staffId,
        staffState,
        staffBranch,
        totalLoans: loans.length,
        activeLoans,
        completedLoans,
        totalDisbursed,
        totalOutstanding,
        totalPaid,
        loans,
      };
    });

    // Apply search filter
    const filtered = q
      ? result.filter(s =>
          s.staffName.toLowerCase().includes(q) ||
          s.staffId.toLowerCase().includes(q)
        )
      : result;

    return filtered.sort((a, b) => b.totalLoans - a.totalLoans);
  }, [beneficiaries, profiles, filterState, filterBranch, searchQuery, fromDate, toDate]);

  // Summary totals
  const totals = useMemo(() => {
    // Deduplicate beneficiaries across staff
    const allBenIds = new Set<string>();
    staffLoanData.forEach(s => s.loans.forEach(l => allBenIds.add(l.id)));
    const uniqueBens = beneficiaries.filter(b => allBenIds.has(b.id));
    return {
      totalStaff: staffLoanData.length,
      totalLoans: uniqueBens.length,
      totalDisbursed: uniqueBens.reduce((s, b) => s + Number(b.loan_amount), 0),
      totalOutstanding: uniqueBens.reduce((s, b) => s + Number(b.outstanding_balance), 0),
      totalPaid: uniqueBens.reduce((s, b) => s + Number(b.total_paid), 0),
    };
  }, [staffLoanData, beneficiaries]);

  const toggleExpand = (userId: string) => {
    setExpandedStaff(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // Reset branch when state changes
  useEffect(() => {
    setFilterBranch('all');
  }, [filterState]);

  // ── Exports ──
  const exportExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();

    // Summary sheet
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      'Total Staff': totals.totalStaff,
      'Total Loans Created': totals.totalLoans,
      'Total Disbursed (₦)': totals.totalDisbursed,
      'Total Outstanding (₦)': totals.totalOutstanding,
      'Total Paid (₦)': totals.totalPaid,
    }]), 'Summary');

    // Staff sheet
    const staffRows = staffLoanData.map((s, i) => ({
      'S/N': i + 1,
      'Staff Name': s.staffName,
      'Staff ID': s.staffId,
      'State': s.staffState,
      'Branch': s.staffBranch,
      'Loans Created': s.totalLoans,
      'Active': s.activeLoans,
      'Completed': s.completedLoans,
      'Total Disbursed (₦)': s.totalDisbursed,
      'Outstanding (₦)': s.totalOutstanding,
      'Total Paid (₦)': s.totalPaid,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(staffRows), 'By Staff');

    // Detailed loans sheet
    const loanRows: any[] = [];
    staffLoanData.forEach(s => {
      s.loans.forEach((l, i) => {
        loanRows.push({
          'Staff Name': s.staffName,
          'Staff ID': s.staffId,
          'S/N': i + 1,
          'Beneficiary': l.name,
          'Loan Ref': l.loan_reference_number || '',
          'Employee ID': l.employee_id,
          'State': l.state,
          'Branch': l.bank_branch,
          'Loan Amount (₦)': l.loan_amount,
          'Outstanding (₦)': l.outstanding_balance,
          'Total Paid (₦)': l.total_paid,
          'EMI (₦)': l.monthly_emi,
          'Tenor': l.tenor_months,
          'Status': l.status,
          'Created': new Date(l.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' }),
        });
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(loanRows), 'Loan Details');

    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Staff_Loan_Tracker_${date}.xlsx`);
    toast({ title: 'Excel exported successfully' });
  }, [staffLoanData, totals, toast]);

  const exportPDF = useCallback(() => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    const date = new Date().toISOString().split('T')[0];
    doc.setFontSize(16);
    doc.text('Staff Loan Creation Tracker', 40, 35);
    doc.setFontSize(9);
    doc.text(`Generated: ${date} | State: ${filterState === 'all' ? 'All' : filterState} | Branch: ${filterBranch === 'all' ? 'All' : filterBranch}`, 40, 50);

    autoTable(doc, {
      startY: 65,
      head: [['S/N', 'Staff Name', 'Staff ID', 'State', 'Branch', 'Loans', 'Active', 'Completed', 'Disbursed (₦)', 'Outstanding (₦)', 'Paid (₦)']],
      body: staffLoanData.map((s, i) => [
        i + 1, s.staffName, s.staffId, s.staffState, s.staffBranch,
        s.totalLoans, s.activeLoans, s.completedLoans,
        formatNaira(s.totalDisbursed), formatNaira(s.totalOutstanding), formatNaira(s.totalPaid),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 100, 60] },
    });

    doc.save(`Staff_Loan_Tracker_${date}.pdf`);
    toast({ title: 'PDF exported successfully' });
  }, [staffLoanData, filterState, filterBranch, toast]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted-foreground">Loading staff loan data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Staff Loan Tracker</h1>
          <p className="text-sm text-muted-foreground">Track loans created by individual staff members</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <Download className="w-4 h-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF}>
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {/* State */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">State</label>
              <Select value={filterState} onValueChange={setFilterState}>
                <SelectTrigger><SelectValue placeholder="All States" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Branch */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Branch</label>
              <Select value={filterBranch} onValueChange={setFilterBranch}>
                <SelectTrigger><SelectValue placeholder="All Branches" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Staff Name / ID</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search staff..."
                  className="pl-9"
                />
              </div>
            </div>

            {/* Date range */}
            <DateRangeFilter fromDate={fromDate} toDate={toDate} onFromDateChange={setFromDate} onToDateChange={setToDate} />

            {/* Reset */}
            <div className="space-y-1 flex items-end">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setFilterState('all');
                  setFilterBranch('all');
                  setSearchQuery('');
                  setFromDate(undefined);
                  setToDate(undefined);
                }}
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10"><Users className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-2xl font-bold font-display">{totals.totalStaff}</p>
              <p className="text-xs text-muted-foreground">Staff Members</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-accent/10"><FileText className="w-5 h-5 text-accent" /></div>
            <div>
              <p className="text-2xl font-bold font-display">{totals.totalLoans}</p>
              <p className="text-xs text-muted-foreground">Loans Created</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-success/10"><Banknote className="w-5 h-5 text-success" /></div>
            <div>
              <p className="text-lg font-bold font-display">{formatNairaShort(totals.totalDisbursed)}</p>
              <p className="text-xs text-muted-foreground">Disbursed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-destructive/10"><TrendingUp className="w-5 h-5 text-destructive" /></div>
            <div>
              <p className="text-lg font-bold font-display">{formatNairaShort(totals.totalOutstanding)}</p>
              <p className="text-xs text-muted-foreground">Outstanding</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10"><Banknote className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-lg font-bold font-display">{formatNairaShort(totals.totalPaid)}</p>
              <p className="text-xs text-muted-foreground">Total Collected</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Staff Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Loans by Staff ({staffLoanData.length} staff)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {staffLoanData.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No loan records found for the selected filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">S/N</TableHead>
                  <TableHead>Staff Name</TableHead>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-center">Loans</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right">Disbursed</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffLoanData.map((staff, idx) => (
                  <>
                    <TableRow
                      key={staff.userId}
                      className="cursor-pointer"
                      onClick={() => toggleExpand(staff.userId)}
                    >
                      <TableCell className="font-medium">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{staff.staffName}</TableCell>
                      <TableCell>{staff.staffId}</TableCell>
                      <TableCell>{staff.staffState}</TableCell>
                      <TableCell>{staff.staffBranch}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{staff.totalLoans}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-success border-success/30">{staff.activeLoans}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatNaira(staff.totalDisbursed)}</TableCell>
                      <TableCell className="text-right">{formatNaira(staff.totalOutstanding)}</TableCell>
                      <TableCell className="text-right text-success">{formatNaira(staff.totalPaid)}</TableCell>
                      <TableCell>
                        {expandedStaff.has(staff.userId) ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Expanded loan details */}
                    {expandedStaff.has(staff.userId) && (
                      <TableRow key={`${staff.userId}-details`}>
                        <TableCell colSpan={11} className="p-0 bg-muted/30">
                          <div className="p-4">
                            <p className="text-xs font-semibold text-muted-foreground mb-2">
                              Loan facilities created by {staff.staffName}
                            </p>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">S/N</TableHead>
                                  <TableHead className="text-xs">Beneficiary</TableHead>
                                  <TableHead className="text-xs">Loan Ref</TableHead>
                                  <TableHead className="text-xs">Employee ID</TableHead>
                                  <TableHead className="text-xs text-right">Loan Amount</TableHead>
                                  <TableHead className="text-xs text-right">Outstanding</TableHead>
                                  <TableHead className="text-xs text-right">Paid</TableHead>
                                  <TableHead className="text-xs text-center">Tenor</TableHead>
                                  <TableHead className="text-xs text-center">Status</TableHead>
                                  <TableHead className="text-xs">Created</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {staff.loans.map((loan, li) => (
                                  <TableRow key={loan.id}>
                                    <TableCell className="text-xs">{li + 1}</TableCell>
                                    <TableCell className="text-xs font-medium">{loan.name}</TableCell>
                                    <TableCell className="text-xs">{loan.loan_reference_number || '—'}</TableCell>
                                    <TableCell className="text-xs">{loan.employee_id}</TableCell>
                                    <TableCell className="text-xs text-right">{formatNaira(loan.loan_amount)}</TableCell>
                                    <TableCell className="text-xs text-right">{formatNaira(loan.outstanding_balance)}</TableCell>
                                    <TableCell className="text-xs text-right text-success">{formatNaira(loan.total_paid)}</TableCell>
                                    <TableCell className="text-xs text-center">{loan.tenor_months}m</TableCell>
                                    <TableCell className="text-xs text-center">
                                      <Badge variant={loan.status === 'active' ? 'default' : loan.status === 'completed' ? 'secondary' : 'destructive'} className="text-[10px]">
                                        {loan.status}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs">{new Date(loan.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' })}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
