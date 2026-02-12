import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateLoan, formatCurrency, formatDate } from '@/lib/loanCalculations';
import { toast } from '@/hooks/use-toast';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
const genderOptions = ['Male', 'Female'];
const maritalStatusOptions = ['Single', 'Married', 'Divorced', 'Widowed'];
export default function AddBeneficiary() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    surname: '',
    firstName: '',
    otherName: '',
    address: '',
    phoneNumber: '',
    email: '',
    bvnNumber: '',
    ninNumber: '',
    nhfNumber: '',
    gender: '',
    maritalStatus: '',
    organization: '',
    employerNumber: '',
    staffIdNumber: '',
    dateOfBirth: '',
    dateOfEmployment: '',
    loanReferenceNumber: '',
    loanAmount: '',
    tenorMonths: '36',
    disbursementDate: '',
    bankBranch: '',
    state: ''
  });
  const amount = parseFloat(form.loanAmount) || 0;
  const tenor = parseInt(form.tenorMonths) || 36;
  const disbDate = form.disbursementDate ? new Date(form.disbursementDate) : null;
  const preview = amount > 0 && tenor > 0 && disbDate ? calculateLoan({
    principal: amount,
    annualRate: 6,
    tenorMonths: tenor,
    moratoriumMonths: 1,
    disbursementDate: disbDate
  }) : null;
  const handleChange = (field: string, value: string) => {
    setForm(prev => ({
      ...prev,
      [field]: value
    }));
  };
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.surname || !form.firstName || !form.staffIdNumber || !amount || !disbDate || !form.state || !form.bankBranch || !form.phoneNumber || !form.gender || !form.organization) {
      toast({
        title: 'Validation Error',
        description: 'Please fill all required fields.',
        variant: 'destructive'
      });
      return;
    }
    if (tenor > 60) {
      toast({
        title: 'Invalid Tenor',
        description: 'Maximum tenor is 60 months (5 years).',
        variant: 'destructive'
      });
      return;
    }
    if (!preview) {
      toast({ title: 'Error', description: 'Unable to calculate loan details.', variant: 'destructive' });
      return;
    }

    const fullName = `${form.surname} ${form.firstName}${form.otherName ? ' ' + form.otherName : ''}`;

    setSubmitting(true);
    const { error } = await supabase.from('beneficiaries').insert({
      name: fullName,
      employee_id: form.staffIdNumber,
      department: form.organization,
      loan_amount: amount,
      tenor_months: tenor,
      interest_rate: 6,
      moratorium_months: 1,
      disbursement_date: form.disbursementDate,
      commencement_date: preview.commencementDate.toISOString().split('T')[0],
      termination_date: preview.terminationDate.toISOString().split('T')[0],
      monthly_emi: preview.monthlyEMI,
      outstanding_balance: preview.totalPayment,
      bank_branch: form.bankBranch,
      state: form.state,
      created_by: user?.id ?? null,
      nhf_number: form.nhfNumber,
    });
    setSubmitting(false);

    if (error) {
      toast({
        title: 'Error Creating Loan',
        description: error.message,
        variant: 'destructive'
      });
      return;
    }

    toast({
      title: 'Loan Created',
      description: `Loan for ${fullName} has been created successfully.`
    });
    navigate('/beneficiaries');
  };
  return <div className="max-w-4xl mx-auto space-y-6">
      <Link to="/beneficiaries" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div>
        <h1 className="text-3xl font-bold font-display">New Loan Application</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create a new Home Renovation Loan facility for a customer</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer Personal Information */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-5">
          <h2 className="text-lg font-bold font-display">Customer Personal Information</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="surname">Surname *</Label>
              <Input id="surname" value={form.surname} onChange={e => handleChange('surname', e.target.value)} placeholder="e.g. Ogundimu" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input id="firstName" value={form.firstName} onChange={e => handleChange('firstName', e.target.value)} placeholder="e.g. Adebayo" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="otherName">Other Name</Label>
              <Input id="otherName" value={form.otherName} onChange={e => handleChange('otherName', e.target.value)} placeholder="e.g. Chukwuemeka" />
            </div>
            <div className="space-y-2">
              <Label>Gender *</Label>
              <Select value={form.gender} onValueChange={v => handleChange('gender', v)}>
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  {genderOptions.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Marital Status</Label>
              <Select value={form.maritalStatus} onValueChange={v => handleChange('maritalStatus', v)}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {maritalStatusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dob">Date of Birth</Label>
              <Input id="dob" type="date" value={form.dateOfBirth} onChange={e => handleChange('dateOfBirth', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Contact & Identification */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-5">
          <h2 className="text-lg font-bold font-display">Contact &amp; Identification</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={form.address} onChange={e => handleChange('address', e.target.value)} placeholder="e.g. 12 Marina Street, Lagos Island" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <Input id="phone" type="tel" value={form.phoneNumber} onChange={e => handleChange('phoneNumber', e.target.value)} placeholder="e.g. 08012345678" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} placeholder="e.g. adebayo@email.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bvn">BVN Number</Label>
              <Input id="bvn" value={form.bvnNumber} onChange={e => handleChange('bvnNumber', e.target.value)} placeholder="e.g. 22012345678" maxLength={11} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nin">NIN Number</Label>
              <Input id="nin" value={form.ninNumber} onChange={e => handleChange('ninNumber', e.target.value)} placeholder="e.g. 12345678901" maxLength={11} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nhf">NHF Number</Label>
              <Input id="nhf" value={form.nhfNumber} onChange={e => handleChange('nhfNumber', e.target.value)} placeholder="e.g. NHF-00012345" />
            </div>
          </div>
        </div>

        {/* Employment Information */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-5">
          <h2 className="text-lg font-bold font-display">Employment Information</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="org">Customer's Organisation *</Label>
              <Input id="org" value={form.organization} onChange={e => handleChange('organization', e.target.value)} placeholder="e.g. Federal Ministry of Works" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="empNo">Employer's Number</Label>
              <Input id="empNo" value={form.employerNumber} onChange={e => handleChange('employerNumber', e.target.value)} placeholder="e.g. EMP-0042" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staffId">Staff ID Number *</Label>
              <Input id="staffId" value={form.staffIdNumber} onChange={e => handleChange('staffIdNumber', e.target.value)} placeholder="e.g. IPPIS-12345" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doe">Date of Employment</Label>
              <Input id="doe" type="date" value={form.dateOfEmployment} onChange={e => handleChange('dateOfEmployment', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Branch & Location */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-5">
          <h2 className="text-lg font-bold font-display">Loan Originating Branch &amp; Location</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>State *</Label>
              <Select value={form.state} onValueChange={v => handleChange('state', v)}>
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch">Bank Branch *</Label>
              <Input id="branch" value={form.bankBranch} onChange={e => handleChange('bankBranch', e.target.value)} placeholder="e.g. Ikeja Branch" />
            </div>
          </div>
        </div>

        {/* Loan Details */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-5">
          <h2 className="text-lg font-bold font-display">Loan Details</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="loanRef">Loan Reference Number</Label>
              <Input id="loanRef" value={form.loanReferenceNumber} onChange={e => handleChange('loanReferenceNumber', e.target.value)} placeholder="e.g. HRL-2025-00123" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Loan Amount (₦) *</Label>
              <Input id="amount" type="number" min={0} value={form.loanAmount} onChange={e => handleChange('loanAmount', e.target.value)} placeholder="e.g. 2500000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenor">Tenor (months, max 60) *</Label>
              <Input id="tenor" type="number" min={1} max={60} value={form.tenorMonths} onChange={e => handleChange('tenorMonths', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="disbDate">Disbursement Date *</Label>
              <Input id="disbDate" type="date" value={form.disbursementDate} onChange={e => handleChange('disbursementDate', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Interest Rate</Label>
              <Input value="6% per annum" disabled />
            </div>
            <div className="space-y-2">
              <Label>Moratorium</Label>
              <Input value="1 month" disabled />
            </div>
            <div className="space-y-2">
              <Label>Monthly Repayment Amount</Label>
              <Input value={preview ? formatCurrency(preview.monthlyEMI) : '—'} disabled />
            </div>
          </div>
        </div>

        {/* Preview */}
        {preview && <div className="bg-card rounded-xl shadow-card p-6 space-y-4 border-2 border-accent/30">
            <h2 className="text-lg font-bold font-display">Loan Preview</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Monthly Repayment</p>
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
          </div>}

        <div className="flex justify-end gap-3">
          <Link to="/beneficiaries">
            <Button variant="outline" type="button">Cancel</Button>
          </Link>
          <Button type="submit" disabled={submitting} className="gradient-accent text-accent-foreground border-0 font-semibold">
            {submitting ? 'Creating…' : 'Create Loan'}
          </Button>
        </div>
      </form>
    </div>;
}