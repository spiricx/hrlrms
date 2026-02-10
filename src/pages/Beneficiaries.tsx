import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, PlusCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/loanCalculations';
import StatusBadge from '@/components/StatusBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Beneficiary = Tables<'beneficiaries'>;

export default function Beneficiaries() {
  const { hasRole } = useAuth();
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = hasRole('admin');

  useEffect(() => {
    const fetchBeneficiaries = async () => {
      const { data, error } = await supabase
        .from('beneficiaries')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        setBeneficiaries(data);
      }
      setLoading(false);
    };
    fetchBeneficiaries();
  }, []);

  const filtered = beneficiaries.filter((b) => {
    const matchesSearch =
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.employee_id.toLowerCase().includes(search.toLowerCase());
    const matchesState = stateFilter === 'all' || b.state === stateFilter;
    return matchesSearch && matchesState;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted-foreground">Loading beneficiaries...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display">Beneficiaries</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage loan beneficiaries and track repayments</p>
        </div>
        <Link to="/add-beneficiary">
          <Button className="gradient-accent text-accent-foreground border-0 font-semibold gap-2">
            <PlusCircle className="w-4 h-4" />
            New Loan
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        {isAdmin && (
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {NIGERIA_STATES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Emp ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">State</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Branch</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Amount</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monthly EMI</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outstanding</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((b) => (
                <tr key={b.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-6 py-4 font-medium whitespace-nowrap">{b.name}</td>
                  <td className="px-6 py-4 text-muted-foreground">{b.employee_id}</td>
                  <td className="px-6 py-4 text-muted-foreground">{b.state || '—'}</td>
                  <td className="px-6 py-4 text-muted-foreground">{b.bank_branch || '—'}</td>
                  <td className="px-6 py-4">{formatCurrency(Number(b.loan_amount))}</td>
                  <td className="px-6 py-4">{formatCurrency(Number(b.monthly_emi))}</td>
                  <td className="px-6 py-4 font-medium">{formatCurrency(Number(b.outstanding_balance))}</td>
                  <td className="px-6 py-4"><StatusBadge status={b.status} /></td>
                  <td className="px-6 py-4">
                    <Link
                      to={`/beneficiary/${b.id}`}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                    No beneficiaries found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
