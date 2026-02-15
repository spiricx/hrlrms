import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, Banknote, Clock, AlertTriangle, Copy, Check } from 'lucide-react';
import { calculateLoan, formatCurrency, formatDate, formatTenor } from '@/lib/loanCalculations';
import StatusBadge from '@/components/StatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import RepaymentSummaryCard from '@/components/beneficiary/RepaymentSummaryCard';
import RepaymentHistoryTable from '@/components/beneficiary/RepaymentHistoryTable';
import RepaymentScheduleGrid from '@/components/beneficiary/RepaymentScheduleGrid';
import LoanStatementExportButtons from '@/components/beneficiary/LoanStatementExport';
import { toast } from 'sonner';

type Beneficiary = Tables<'beneficiaries'>;
type Transaction = Tables<'transactions'>;

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center ml-1.5 p-0.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
      title={`Copy ${label}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function BeneficiaryDetail() {
  const { id } = useParams<{ id: string }>();
  const [beneficiary, setBeneficiary] = useState<Beneficiary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<{ full_name: string; state: string; bank_branch: string } | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      const [benRes, txRes] = await Promise.all([
        supabase.from('beneficiaries').select('*').eq('id', id).maybeSingle(),
        supabase.from('transactions').select('*').eq('beneficiary_id', id).order('month_for', { ascending: true }),
      ]);

      if (benRes.error) {
        setError('Beneficiary not found or access denied.');
      } else if (!benRes.data) {
        setError('Beneficiary not found.');
      } else {
        setBeneficiary(benRes.data);

        // Fetch creator profile if created_by exists
        if (benRes.data.created_by) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('full_name, state, bank_branch')
            .eq('user_id', benRes.data.created_by)
            .maybeSingle();
          if (profileData) {
            setCreatorProfile(profileData);
          }
        }
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
    { label: 'Organization', value: beneficiary.department, icon: <Banknote className="w-4 h-4" /> },
    { label: 'State', value: beneficiary.state || '—', icon: <Banknote className="w-4 h-4" /> },
    { label: 'Branch', value: beneficiary.bank_branch || '—', icon: <Banknote className="w-4 h-4" /> },
    { label: 'Loan Amount', value: formatCurrency(Number(beneficiary.loan_amount)), icon: <Banknote className="w-4 h-4" /> },
    { label: 'Monthly Repayment', value: formatCurrency(loan.monthlyEMI), icon: <Banknote className="w-4 h-4" /> },
    { label: 'Disbursed On', value: formatDate(new Date(beneficiary.disbursement_date)), icon: <Calendar className="w-4 h-4" /> },
    { label: 'Commencement', value: formatDate(loan.commencementDate), icon: <Calendar className="w-4 h-4" /> },
    { label: 'Termination Date', value: formatDate(loan.terminationDate), icon: <Calendar className="w-4 h-4" /> },
    { label: 'Tenor', value: formatTenor(beneficiary.tenor_months), icon: <Clock className="w-4 h-4" /> },
    { label: 'Total Interest', value: formatCurrency(loan.totalInterest), icon: <Banknote className="w-4 h-4" /> },
    { label: 'Total Payment', value: formatCurrency(loan.totalPayment), icon: <Banknote className="w-4 h-4" /> },
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
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2">
              <span className="text-sm font-bold text-foreground inline-flex items-center">
                Loan Ref: <span className="font-mono ml-1">{beneficiary.loan_reference_number || 'Not Set'}</span>
                {beneficiary.loan_reference_number && (
                  <CopyButton value={beneficiary.loan_reference_number} label="Loan Reference" />
                )}
              </span>
              <span className="text-sm font-bold text-foreground inline-flex items-center">
                NHF Number: <span className="font-mono ml-1">{beneficiary.nhf_number || 'Not Set'}</span>
                {beneficiary.nhf_number && (
                  <CopyButton value={beneficiary.nhf_number} label="NHF Number" />
                )}
              </span>
            </div>
          </div>
          <StatusBadge status={beneficiary.status} />
        </div>

        {creatorProfile && (
          <div className="mt-3 text-sm text-muted-foreground border-t border-border pt-3">
            <span className="font-semibold text-foreground">Loan Created By:</span>{' '}
            {creatorProfile.full_name || 'Unknown'} — {creatorProfile.state || '—'}, {creatorProfile.bank_branch || '—'}
            {' | '}
            <span className="font-semibold text-foreground">Account Created:</span>{' '}
            {formatDate(new Date(beneficiary.created_at))} at {new Date(beneficiary.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}
          </div>
        )}

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

      {/* Repayment Summary Card */}
      <RepaymentSummaryCard
        totalPaid={Number(beneficiary.total_paid)}
        outstandingBalance={Number(beneficiary.outstanding_balance)}
        totalExpected={loan.totalPayment}
        tenorMonths={beneficiary.tenor_months}
        transactions={transactions}
        schedule={loan.schedule}
      />

      {/* Loan Statement Export */}
      <LoanStatementExportButtons
        beneficiary={beneficiary}
        schedule={loan.schedule}
        transactions={transactions}
        totalExpected={loan.totalPayment}
        monthlyEMI={loan.monthlyEMI}
        totalInterest={loan.totalInterest}
        commencementDate={loan.commencementDate}
        terminationDate={loan.terminationDate}
        creatorProfile={creatorProfile}
      />

      {/* Tabs */}
      <Tabs defaultValue="history" className="space-y-4">
        <TabsList className="bg-secondary">
          <TabsTrigger value="history">Repayment History</TabsTrigger>
          <TabsTrigger value="visual">Repayment Schedule</TabsTrigger>
          <TabsTrigger value="amortization">Amortization Table</TabsTrigger>
        </TabsList>

        {/* Enhanced Repayment History */}
        <TabsContent value="history">
          <RepaymentHistoryTable
            schedule={loan.schedule}
            transactions={transactions}
            totalExpected={loan.totalPayment}
            totalPaid={Number(beneficiary.total_paid)}
            outstandingBalance={Number(beneficiary.outstanding_balance)}
          />
        </TabsContent>

        {/* Visual Repayment Schedule Grid */}
        <TabsContent value="visual">
          <RepaymentScheduleGrid schedule={loan.schedule} transactions={transactions} />
        </TabsContent>

        {/* Original Amortization Table */}
        <TabsContent value="amortization">
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
                    <tr key={entry.month} className="table-row-highlight">
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
      </Tabs>
    </div>
  );
}
