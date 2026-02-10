import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Banknote, Clock, AlertTriangle } from 'lucide-react';
import { mockBeneficiaries, mockTransactions } from '@/lib/mockData';
import { calculateLoan, formatCurrency, formatDate } from '@/lib/loanCalculations';
import StatusBadge from '@/components/StatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function BeneficiaryDetail() {
  const { id } = useParams<{ id: string }>();
  const beneficiary = mockBeneficiaries.find((b) => b.id === id);

  if (!beneficiary) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg text-muted-foreground">Beneficiary not found</p>
        <Link to="/beneficiaries" className="mt-4 text-accent hover:underline">
          ← Back to Beneficiaries
        </Link>
      </div>
    );
  }

  const loan = calculateLoan({
    principal: beneficiary.loanAmount,
    annualRate: 6,
    tenorMonths: beneficiary.tenorMonths,
    moratoriumMonths: 1,
    disbursementDate: beneficiary.disbursementDate,
  });

  const transactions = mockTransactions.filter((t) => t.beneficiaryId === beneficiary.id);

  const infoItems = [
    { label: 'Employee ID', value: beneficiary.employeeId, icon: <Clock className="w-4 h-4" /> },
    { label: 'Department', value: beneficiary.department, icon: <Banknote className="w-4 h-4" /> },
    { label: 'Loan Amount', value: formatCurrency(beneficiary.loanAmount), icon: <Banknote className="w-4 h-4" /> },
    { label: 'Monthly EMI', value: formatCurrency(loan.monthlyEMI), icon: <Banknote className="w-4 h-4" /> },
    { label: 'Disbursed On', value: formatDate(beneficiary.disbursementDate), icon: <Calendar className="w-4 h-4" /> },
    { label: 'Commencement', value: formatDate(loan.commencementDate), icon: <Calendar className="w-4 h-4" /> },
    { label: 'Termination Date', value: formatDate(loan.terminationDate), icon: <Calendar className="w-4 h-4" /> },
    { label: 'Tenor', value: `${beneficiary.tenorMonths} months`, icon: <Clock className="w-4 h-4" /> },
    { label: 'Total Interest', value: formatCurrency(loan.totalInterest), icon: <Banknote className="w-4 h-4" /> },
    { label: 'Total Payment', value: formatCurrency(loan.totalPayment), icon: <Banknote className="w-4 h-4" /> },
    { label: 'Defaults', value: String(beneficiary.defaultCount), icon: <AlertTriangle className="w-4 h-4" /> },
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
                        <td className="px-6 py-4 font-mono text-sm">{t.rrrNumber}</td>
                        <td className="px-6 py-4 font-medium">{formatCurrency(t.amount)}</td>
                        <td className="px-6 py-4">{formatDate(t.datePaid)}</td>
                        <td className="px-6 py-4 text-muted-foreground">{t.monthFor}</td>
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
