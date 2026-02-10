import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateLoan, formatCurrency, formatDate } from '@/lib/loanCalculations';
import { toast } from '@/hooks/use-toast';

const departments = ['Engineering', 'Finance', 'Human Resources', 'Operations', 'Marketing', 'IT', 'Admin', 'Legal'];

export default function AddBeneficiary() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    employeeId: '',
    department: '',
    loanAmount: '',
    tenorMonths: '36',
    disbursementDate: '',
  });

  const amount = parseFloat(form.loanAmount) || 0;
  const tenor = parseInt(form.tenorMonths) || 36;
  const disbDate = form.disbursementDate ? new Date(form.disbursementDate) : null;

  const preview =
    amount > 0 && tenor > 0 && disbDate
      ? calculateLoan({
          principal: amount,
          annualRate: 6,
          tenorMonths: tenor,
          moratoriumMonths: 1,
          disbursementDate: disbDate,
        })
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.employeeId || !form.department || !amount || !disbDate) {
      toast({ title: 'Validation Error', description: 'Please fill all required fields.', variant: 'destructive' });
      return;
    }
    if (tenor > 60) {
      toast({ title: 'Invalid Tenor', description: 'Maximum tenor is 60 months (5 years).', variant: 'destructive' });
      return;
    }
    toast({ title: 'Loan Created', description: `Loan for ${form.name} has been created successfully.` });
    navigate('/beneficiaries');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link to="/beneficiaries" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div>
        <h1 className="text-3xl font-bold font-display">New Loan Application</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create a new Home Renovation Loan facility for a staff member</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-card rounded-xl shadow-card p-6 space-y-5">
          <h2 className="text-lg font-bold font-display">Staff Information</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Adebayo Ogundimu" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="empId">Employee ID *</Label>
              <Input id="empId" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} placeholder="e.g. EMP-1024" />
            </div>
            <div className="space-y-2">
              <Label>Department *</Label>
              <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl shadow-card p-6 space-y-5">
          <h2 className="text-lg font-bold font-display">Loan Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount">Loan Amount (₦) *</Label>
              <Input id="amount" type="number" min={0} value={form.loanAmount} onChange={(e) => setForm({ ...form, loanAmount: e.target.value })} placeholder="e.g. 2500000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenor">Tenor (months, max 60) *</Label>
              <Input id="tenor" type="number" min={1} max={60} value={form.tenorMonths} onChange={(e) => setForm({ ...form, tenorMonths: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="disbDate">Disbursement Date *</Label>
              <Input id="disbDate" type="date" value={form.disbursementDate} onChange={(e) => setForm({ ...form, disbursementDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Interest Rate</Label>
              <Input value="6% per annum" disabled />
            </div>
            <div className="space-y-2">
              <Label>Moratorium</Label>
              <Input value="1 month" disabled />
            </div>
          </div>
        </div>

        {/* Preview */}
        {preview && (
          <div className="bg-card rounded-xl shadow-card p-6 space-y-4 border-2 border-accent/30">
            <h2 className="text-lg font-bold font-display">Loan Preview</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Monthly EMI</p>
                <p className="text-lg font-bold text-accent">{formatCurrency(preview.monthlyEMI)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Interest</p>
                <p className="text-lg font-bold">{formatCurrency(preview.totalInterest)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Payment</p>
                <p className="text-lg font-bold">{formatCurrency(preview.totalPayment)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Termination Date</p>
                <p className="text-lg font-bold">{formatDate(preview.terminationDate)}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Link to="/beneficiaries">
            <Button variant="outline" type="button">Cancel</Button>
          </Link>
          <Button type="submit" className="gradient-accent text-accent-foreground border-0 font-semibold">
            Create Loan
          </Button>
        </div>
      </form>
    </div>
  );
}
