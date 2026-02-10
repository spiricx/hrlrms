import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, PlusCircle } from 'lucide-react';
import { mockBeneficiaries } from '@/lib/mockData';
import { formatCurrency, formatDate } from '@/lib/loanCalculations';
import StatusBadge from '@/components/StatusBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function Beneficiaries() {
  const [search, setSearch] = useState('');

  const filtered = mockBeneficiaries.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.employeeId.toLowerCase().includes(search.toLowerCase()) ||
      b.department.toLowerCase().includes(search.toLowerCase())
  );

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

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, ID, or department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Emp ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dept</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Amount</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monthly EMI</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outstanding</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tenor</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Termination</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((b) => (
                <tr key={b.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-6 py-4 font-medium whitespace-nowrap">{b.name}</td>
                  <td className="px-6 py-4 text-muted-foreground">{b.employeeId}</td>
                  <td className="px-6 py-4 text-muted-foreground">{b.department}</td>
                  <td className="px-6 py-4">{formatCurrency(b.loanAmount)}</td>
                  <td className="px-6 py-4">{formatCurrency(b.monthlyEMI)}</td>
                  <td className="px-6 py-4 font-medium">{formatCurrency(b.outstandingBalance)}</td>
                  <td className="px-6 py-4 text-muted-foreground">{b.tenorMonths}m</td>
                  <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">{formatDate(b.terminationDate)}</td>
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
                  <td colSpan={10} className="px-6 py-12 text-center text-muted-foreground">
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
