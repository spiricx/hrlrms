import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Search, Filter, ChevronRight, Download, MapPin, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatTenor, getOverdueAndArrears, getMonthsDue, stripTime } from '@/lib/loanCalculations';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from
'@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

type Beneficiary = Tables<'beneficiaries'>;
type Transaction = Tables<'transactions'>;

interface BeneficiaryWithPayment extends Beneficiary {
  lastTransaction?: Transaction | null;
}


function formatPaymentDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(date));
}

type StatusInfo = {label: string;className: string;};

function getStatusInfo(b: Beneficiary): StatusInfo {
  const oa = getOverdueAndArrears(
    b.commencement_date, b.tenor_months, Number(b.monthly_emi),
    Number(b.total_paid), Number(b.outstanding_balance), b.status
  );

  if (Number(b.outstanding_balance) <= 0 || b.status === 'completed') {
    return { label: 'Fully Repaid', className: 'bg-primary/10 text-primary border-primary/20' };
  }

  const monthsDue = getMonthsDue(b.commencement_date, b.tenor_months);
  if (monthsDue === 0) {
    return { label: 'Active', className: 'bg-muted text-muted-foreground border-border' };
  }

  if (oa.overdueMonths === 0) {
    return { label: 'Current', className: 'bg-success/10 text-success border-success/20' };
  }

  if (oa.monthsInArrears === 0 && oa.overdueMonths > 0) {
    return { label: 'Overdue', className: 'bg-warning/10 text-warning border-warning/20' };
  }

  const dpd = oa.monthsInArrears * 30;
  if (dpd >= 90) {
    return { label: `NPL / ${dpd} Days`, className: 'bg-destructive/10 text-destructive border-destructive/20' };
  }
  return { label: `${dpd} Days Past Due`, className: 'bg-warning/10 text-warning border-warning/20' };
}

function getArrearsAmount(b: Beneficiary): number {
  const oa = getOverdueAndArrears(
    b.commencement_date, b.tenor_months, Number(b.monthly_emi),
    Number(b.total_paid), Number(b.outstanding_balance), b.status
  );
  return oa.arrearsAmount;
}

type FilterType = 'all' | 'current' | 'arrears' | 'npl' | 'repaid';

function isDefaulted(b: Beneficiary): boolean {
  if (b.status === 'completed' || Number(b.outstanding_balance) <= 0) return false;
  const comm = stripTime(new Date(b.commencement_date));
  const today = stripTime(new Date());
  const monthlyEmi = Number(b.monthly_emi);
  const totalPaid = Number(b.total_paid);
  if (monthlyEmi <= 0 || today < comm) return false;
  const arrears = getOverdueAndArrears(b.commencement_date, b.tenor_months, monthlyEmi, totalPaid, Number(b.outstanding_balance), b.status);
  if (arrears.overdueMonths > 0) {
    const paidMonths = Math.floor(totalPaid / monthlyEmi);
    const firstUnpaidDate = new Date(comm);
    firstUnpaidDate.setMonth(firstUnpaidDate.getMonth() + paidMonths);
    const dueDateStripped = stripTime(firstUnpaidDate);
    const dpd = Math.max(0, Math.floor((today.getTime() - dueDateStripped.getTime()) / (1000 * 60 * 60 * 24))) + 1;
    return dpd >= 90;
  }
  return false;
}

interface WidgetProps {
  healthFilter?: 'all' | 'active' | 'defaulted';
}

export default function RecentBeneficiariesWidget({ healthFilter = 'all' }: WidgetProps) {
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryWithPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');

  const fetchData = useCallback(async () => {
    const { data: bens } = await supabase.
    from('beneficiaries').
    select('*').
    order('created_at', { ascending: false }).
    limit(20);

    if (!bens) {setLoading(false);return;}

    const benIds = bens.map((b) => b.id);
    const { data: txns } = await supabase.
    from('transactions').
    select('*').
    in('beneficiary_id', benIds).
    order('date_paid', { ascending: false });

    const latestTxMap = new Map<string, Transaction>();
    txns?.forEach((t) => {
      if (!latestTxMap.has(t.beneficiary_id)) latestTxMap.set(t.beneficiary_id, t);
    });

    setBeneficiaries(bens.map((b) => ({ ...b, lastTransaction: latestTxMap.get(b.id) ?? null })));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // Derive unique states and branches for filter dropdowns
  const { states, branches } = useMemo(() => {
    const stSet = new Set<string>();
    const brSet = new Set<string>();
    beneficiaries.forEach((b) => {
      if (b.state) stSet.add(b.state);
      if (b.bank_branch) brSet.add(b.bank_branch);
    });
    return {
      states: Array.from(stSet).sort(),
      branches: Array.from(brSet).sort()
    };
  }, [beneficiaries]);

  // Filtered branches based on selected state
  const filteredBranches = useMemo(() => {
    if (stateFilter === 'all') return branches;
    const brSet = new Set<string>();
    beneficiaries.forEach((b) => {
      if (b.state === stateFilter && b.bank_branch) brSet.add(b.bank_branch);
    });
    return Array.from(brSet).sort();
  }, [beneficiaries, stateFilter, branches]);

  const filtered = useMemo(() => {
    let list = beneficiaries;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) => b.name.toLowerCase().includes(q) || b.employee_id.toLowerCase().includes(q)
      );
    }

    if (stateFilter !== 'all') {
      list = list.filter((b) => b.state === stateFilter);
    }

    if (branchFilter !== 'all') {
      list = list.filter((b) => b.bank_branch === branchFilter);
    }

    if (filter !== 'all') {
      list = list.filter((b) => {
        const oa = getOverdueAndArrears(
          b.commencement_date, b.tenor_months, Number(b.monthly_emi),
          Number(b.total_paid), Number(b.outstanding_balance), b.status
        );
        const monthsDue = getMonthsDue(b.commencement_date, b.tenor_months);
        switch (filter) {
          case 'current':return monthsDue > 0 && oa.overdueMonths === 0;
          case 'arrears':return oa.monthsInArrears > 0 && oa.monthsInArrears * 30 < 90;
          case 'npl':return oa.monthsInArrears * 30 >= 90;
          case 'repaid':return Number(b.outstanding_balance) <= 0 || b.status === 'completed';
          default:return true;
        }
      });
    }

    // Apply dashboard-level health filter
    if (healthFilter === 'active') {
      list = list.filter((b) => !isDefaulted(b) && Number(b.outstanding_balance) > 0 && b.status !== 'completed');
    } else if (healthFilter === 'defaulted') {
      list = list.filter((b) => isDefaulted(b));
    }

    return list;
  }, [beneficiaries, search, filter, stateFilter, branchFilter, healthFilter]);

  const getLastPaymentDisplay = (b: BeneficiaryWithPayment): string => {
    if (Number(b.outstanding_balance) <= 0 && b.lastTransaction) {
      return `Fully Repaid on ${formatPaymentDate(b.lastTransaction.date_paid)}`;
    }
    if (!b.lastTransaction) return 'No payment recorded';
    return `${formatPaymentDate(b.lastTransaction.date_paid)} (${formatCurrency(Number(b.lastTransaction.amount))})`;
  };

   const handleExport = () => {
    const rows = filtered.map((b, idx) => {
      const oa = getOverdueAndArrears(
        b.commencement_date, b.tenor_months, Number(b.monthly_emi),
        Number(b.total_paid), Number(b.outstanding_balance), b.status
      );
      const dpd = oa.monthsInArrears * 30;
      return {
        '#': idx + 1,
        'Beneficiary': b.name,
        'Organization': b.department || '—',
        'Loan Reference Number': b.loan_reference_number || '—',
        'NHF No': b.nhf_number || '—',
        'Gender': b.gender || '—',
        'State': b.state || '—',
        'Branch': b.bank_branch || '—',
        'Tenor': formatTenor(b.tenor_months),
        'Loan Amount': Number(b.loan_amount),
        'Monthly Repayment': Number(b.monthly_emi),
        'Outstanding': Number(b.outstanding_balance),
        'Total Amount Paid': Number(b.total_paid),
        'Last Payment Amount': b.lastTransaction ? Number(b.lastTransaction.amount) : 0,
        'Last Payment Date': b.lastTransaction ? formatPaymentDate(b.lastTransaction.date_paid) : '—',
        'Age of Arrears': dpd > 0 ? `${dpd} Days` : '—',
        'Months of Arrears': oa.monthsInArrears,
        'Amount in Arrears': oa.arrearsAmount,
        'Status': getStatusInfo(b).label
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recent Beneficiaries');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf], { type: 'application/octet-stream' }), 'recent_beneficiaries.xlsx');
  };

  // Reset branch when state changes
  const handleStateChange = (val: string) => {
    setStateFilter(val);
    setBranchFilter('all');
  };

  return (
    <div className="bg-card rounded-xl shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 px-6 py-4 border-b border-border sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold font-display">Recent Beneficiaries</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-1.5">
            <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
            Refresh
          </Button>
          <Link to="/beneficiaries">
            <Button variant="outline" size="sm" className="gap-1.5">
              View All
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-2 px-6 py-3 border-b border-border">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or loan ref..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9" />

          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
            <SelectTrigger className="w-full sm:w-[150px] h-9">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="current">Current</SelectItem>
              <SelectItem value="arrears">In Arrears</SelectItem>
              <SelectItem value="npl">NPL</SelectItem>
              <SelectItem value="repaid">Fully Repaid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* State & Branch filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={stateFilter} onValueChange={handleStateChange}>
            <SelectTrigger className="w-full sm:w-[180px] h-9">
              <MapPin className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {states.map((s) =>
              <SelectItem key={s} value={s}>{s}</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-full sm:w-[200px] h-9">
              <Building2 className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="All Branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {filteredBranches.map((br) =>
              <SelectItem key={br} value={br}>{br}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">#</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Beneficiary</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Organization</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Ref No</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">NHF No</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gender</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">State</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Branch</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tenor</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Amount</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monthly Repayment</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outstanding</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Paid</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Pmt Amt</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Pmt Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Age of Arrears</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mths Arrears</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amt in Arrears</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading &&
            <tr>
                <td colSpan={19} className="px-4 py-12 text-center text-muted-foreground">
                  <div className="animate-pulse">Loading recent beneficiaries...</div>
                </td>
              </tr>
            }
            {!loading && filtered.length === 0 &&
            <tr>
                <td colSpan={19} className="px-4 py-12 text-center text-muted-foreground">
                  No beneficiaries found.
                </td>
              </tr>
            }
            {!loading &&
            filtered.map((b, idx) => {
              const statusInfo = getStatusInfo(b);
              const oa = getOverdueAndArrears(
                b.commencement_date, b.tenor_months, Number(b.monthly_emi),
                Number(b.total_paid), Number(b.outstanding_balance), b.status
              );
              const dpd = oa.monthsInArrears * 30;
              return (
                <tr key={b.id} className="table-row-highlight group">
                    {/* # */}
                    <td className="px-4 py-3 text-muted-foreground text-xs">{idx + 1}</td>
                    {/* Beneficiary */}
                    <td className="px-4 py-3">
                      <Link to={`/beneficiary/${b.id}`} className="flex items-center gap-2.5 group-hover:underline">
                        <Avatar className="h-7 w-7 text-[10px]">
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                            {b.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <span className="font-medium whitespace-nowrap block">{b.name}</span>
                          <span className="text-[11px] text-muted-foreground sm:hidden block">
                            {b.state || '—'} · {b.bank_branch || '—'}
                          </span>
                        </div>
                      </Link>
                    </td>
                    {/* Organization */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{b.department || '—'}</td>
                    {/* Loan Reference Number */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-muted-foreground">
                      {b.loan_reference_number || '—'}
                    </td>
                    {/* NHF No */}
                    <td className="px-4 py-3">
                      <Link to={`/beneficiary/${b.id}`} className="text-accent hover:underline font-mono text-xs">
                        {b.nhf_number || '—'}
                      </Link>
                    </td>
                    {/* Gender */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{b.gender || '—'}</td>
                    {/* State */}
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs hidden sm:table-cell">
                      {b.state || '—'}
                    </td>
                    {/* Branch */}
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs hidden sm:table-cell">
                      {b.bank_branch || '—'}
                    </td>
                    {/* Tenor */}
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {formatTenor(b.tenor_months)}
                    </td>
                    {/* Loan Amount */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatCurrency(Number(b.loan_amount))}
                    </td>
                    {/* Monthly Repayment */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatCurrency(Number(b.monthly_emi))}
                    </td>
                    {/* Outstanding */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatCurrency(Number(b.outstanding_balance))}
                    </td>
                    {/* Total Amount Paid */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatCurrency(Number(b.total_paid))}
                    </td>
                    {/* Last Payment Amount */}
                    <td className="px-4 py-3 text-right whitespace-nowrap text-xs">
                      {b.lastTransaction ? formatCurrency(Number(b.lastTransaction.amount)) : <span className="text-muted-foreground">—</span>}
                    </td>
                    {/* Last Payment Date */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {b.lastTransaction ? formatPaymentDate(b.lastTransaction.date_paid) : '—'}
                    </td>
                    {/* Age of Arrears (DPD) */}
                    <td className={cn('px-4 py-3 whitespace-nowrap text-xs', dpd > 0 ? 'text-destructive font-semibold' : 'text-muted-foreground')}>
                      {dpd > 0 ? `${dpd} Days` : '—'}
                    </td>
                    {/* Months of Arrears */}
                    <td className={cn('px-4 py-3 text-center whitespace-nowrap text-xs', oa.monthsInArrears > 0 ? 'text-destructive font-semibold' : 'text-muted-foreground')}>
                      {oa.monthsInArrears}
                    </td>
                    {/* Amount in Arrears */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {oa.arrearsAmount > 0 ?
                        <span className="text-destructive font-medium">{formatCurrency(oa.arrearsAmount)}</span> :
                        <span className="text-muted-foreground">₦0</span>
                      }
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap',
                        statusInfo.className
                      )}>
                        {statusInfo.label}
                      </span>
                    </td>
                  </tr>);

            })}
          </tbody>
        </table>
      </div>
    </div>);

}