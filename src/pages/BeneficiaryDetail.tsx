import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, Banknote, Clock, AlertTriangle } from 'lucide-react';
import { calculateLoan, formatCurrency, formatDate } from '@/lib/loanCalculations';
import StatusBadge from '@/components/StatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Beneficiary = Tables<'beneficiaries'>;
type Transaction = Tables<'transactions'>;

export default function BeneficiaryDetail() {
  const { id } = useParams<{ id: string }>();
  const [beneficiary, setBeneficiary] = useState<Beneficiary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      const [benRes, txRes] = await Promise.all([
        supabase.from('beneficiaries').select('*').eq('id', id).single(),
        supabase.from('transactions').select('*').eq('beneficiary_id', id).order('month_for', { ascending: true }),
      ]);

      if (benRes.error) {
        setError('Beneficiary not found or access denied.');
      } else {
        setBeneficiary(benRes.data);
      }

      if (!txRes.error && txRes.data) {
        setTransactions(txRes.data);
      }

      setLoading(false);
    };

    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted-foreground">Loading loan details...</div>
      </div>
    );
  }

  if (error || !beneficiary) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg text-muted-foreground">{error || 'Beneficiary not found'}</p>
        <Link to="/beneficiaries" className="mt-4 text-accent hover:underline">
          ← Back to Beneficiaries
        </Link>
      </div>
    );
  }

  const loan = calculateLoan({
    principal: Number(beneficiary.loan_amount),
    annualRate: Number(beneficiary.interest_rate),
    tenorMonths: beneficiary.tenor_months,
    moratoriumMonths: beneficiary.moratorium_months,
    disbursementDate: new Date(beneficiary.disbursement_date),
  });

  const infoItems = [
    { label: 'Employee ID', value: beneficiary.employee_id, icon: <Clock className="w-4 h-4" /> },
    { label: 'Department', value: beneficiary.department, icon: <Banknote className="w-4 h-4" /> },
    { label: 'State', value: beneficiary.state || '—', icon: <Banknote className="w-4 h-4" /> },
    { label: 'Branch', value: beneficiary.bank_branch || '—', icon: <Banknote className="w-4 h-4" /> },
    { label: 'Loan Amount', value: formatCurrency(Number(beneficiary.loan_amount)), icon: <Banknote className="w-4 h-4" /> },
    { label: 'Monthly EMI', value: formatCurrency(loan.monthlyEMI), icon: <Banknote className="w-4 h-4" /> },
    { label: 'Disbursed On', value: formatDate(new Date(beneficiary.disbursement_date)), icon: <Calendar className="w-4 h-4" /> },
    { label: 'Commencement', value: formatDate(loan.commencementDate), icon: <Calendar className="w-4 h-4" /> },
    { label: 'Termination Date', value: formatDate(loan.terminationDate), icon: <Calendar className="w-4 h-4" /> },
    { label: 'Tenor', value: `${beneficiary.tenor_months} months`, icon: <Clock className="w-4 h-4" /> },
    { label: 'Total Interest', value: formatCurrency(loan.totalInterest), icon: <Banknote className="w-4 h-4" /> },
    { label: 'Total Payment', value: formatCurrency(loan.totalPayment), icon: <Banknote className="w-4 h-4" /> },
    { label: 'Outstanding', value: formatCurrency(Number(beneficiary.outstanding_balance)), icon: <Banknote className="w-4 h-4" /> },
    { label: 'Total Paid', value: formatCurrency(Number(beneficiary.total_paid)), icon: <Banknote className="w-4 h-4" /> },
    { label: 'Defaults', value: String(beneficiary.default_count), icon: <AlertTriangle className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <Link to="/beneficiaries" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Beneficiaries
      </Link>

      {/* Header */}
      <div className="bg-card rounded-xl shadow-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display">{beneficiary.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">Loan facility details and repayment history</p>
          </div>
          <StatusBadge status={beneficiary.status} />
        </div>

        <div className="grid gap-4 mt-6 sm:grid-cols-2 lg:grid-cols-4">
          {infoItems.map((item) => (
            <div key={item.label} className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-secondary text-muted-foreground">{item.icon}</div>
              <div>
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-sm font-semibold">{item.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="schedule" className="space-y-4">
        <TabsList className="bg-secondary">
          <TabsTrigger value="schedule">Repayment Schedule</TabsTrigger>
          <TabsTrigger value="transactions">Transactions ({transactions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule">
          <div className="bg-card rounded-xl shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Due Date</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opening Bal.</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Principal</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Interest</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">EMI</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Closing Bal.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loan.schedule.map((entry) => (
                    <tr key={entry.month} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">{entry.month}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(entry.dueDate)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(entry.openingBalance)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(entry.principal)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(entry.interest)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(entry.emi)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(entry.closingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="transactions">
          <div className="bg-card rounded-xl shadow-card overflow-hidden">
            {transactions.length === 0 ? (
              <div className="px-6 py-12 text-center text-muted-foreground">
                No transactions recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">RRR Number</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date Paid</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Month #</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transactions.map((t) => (
                      <tr key={t.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-6 py-4 font-mono text-sm">{t.rrr_number}</td>
                        <td className="px-6 py-4 font-medium">{formatCurrency(Number(t.amount))}</td>
                        <td className="px-6 py-4">{formatDate(new Date(t.date_paid))}</td>
                        <td className="px-6 py-4 text-muted-foreground">{t.month_for}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
