import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

type Beneficiary = {
  id: string;
  name: string;
  title: string | null;
  surname: string | null;
  first_name: string | null;
  other_name: string | null;
  gender: string | null;
  marital_status: string | null;
  date_of_birth: string | null;
  address: string | null;
  phone_number: string | null;
  email: string | null;
  bvn_number: string | null;
  nin_number: string | null;
  nhf_number: string | null;
  department: string;
  employer_number: string | null;
  employee_id: string;
  date_of_employment: string | null;
  state: string;
  bank_branch: string;
  loan_reference_number: string | null;
};

interface BioDataEditFormProps {
  beneficiary: Beneficiary;
  onSaved: () => void;
  onCancel: () => void;
}

const TITLE_OPTIONS = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Chief', 'Alhaji', 'Alhaja', 'Engr', 'Arc', 'Barr'];
const GENDER_OPTIONS = ['Male', 'Female'];
const MARITAL_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed'];

export default function BioDataEditForm({ beneficiary, onSaved, onCancel }: BioDataEditFormProps) {
  const b = beneficiary;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: b.title || '',
    surname: b.surname || b.name?.split(' ')[0] || '',
    first_name: b.first_name || b.name?.split(' ')[1] || '',
    other_name: b.other_name || '',
    gender: b.gender || '',
    marital_status: b.marital_status || '',
    date_of_birth: b.date_of_birth || '',
    address: b.address || '',
    phone_number: b.phone_number || '',
    email: b.email || '',
    bvn_number: b.bvn_number || '',
    nin_number: b.nin_number || '',
    nhf_number: b.nhf_number || '',
    department: b.department || '',
    employer_number: b.employer_number || '',
    employee_id: b.employee_id || '',
    date_of_employment: b.date_of_employment || '',
    state: b.state || '',
    bank_branch: b.bank_branch || '',
    loan_reference_number: b.loan_reference_number || '',
  });

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.surname.trim() || !form.first_name.trim()) {
      toast.error('Surname and First Name are required.');
      return;
    }
    setSaving(true);
    const fullName = `${form.surname} ${form.first_name} ${form.other_name}`.trim();
    const { error } = await supabase
      .from('beneficiaries')
      .update({
        title: form.title,
        surname: form.surname,
        first_name: form.first_name,
        other_name: form.other_name,
        name: fullName,
        gender: form.gender,
        marital_status: form.marital_status,
        date_of_birth: form.date_of_birth || null,
        address: form.address,
        phone_number: form.phone_number,
        email: form.email,
        bvn_number: form.bvn_number,
        nin_number: form.nin_number,
        nhf_number: form.nhf_number,
        department: form.department,
        employer_number: form.employer_number,
        employee_id: form.employee_id,
        date_of_employment: form.date_of_employment || null,
        state: form.state,
        bank_branch: form.bank_branch,
        loan_reference_number: form.loan_reference_number,
      })
      .eq('id', b.id);

    setSaving(false);
    if (error) {
      toast.error('Failed to update: ' + error.message);
    } else {
      toast.success('Bio data updated successfully.');
      onSaved();
    }
  };

  const field = (label: string, key: string, type = 'text') => (
    <div className="space-y-1" key={key}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={(form as any)[key]} onChange={e => set(key, e.target.value)} className="h-9 text-sm" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Personal Information */}
      <div>
        <h3 className="text-sm font-semibold text-primary mb-2 border-b border-border pb-1">Personal Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Title</Label>
            <Select value={form.title} onValueChange={v => set('title', v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{TITLE_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {field('Surname', 'surname')}
          {field('First Name', 'first_name')}
          {field('Other Name', 'other_name')}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Gender</Label>
            <Select value={form.gender} onValueChange={v => set('gender', v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{GENDER_OPTIONS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Marital Status</Label>
            <Select value={form.marital_status} onValueChange={v => set('marital_status', v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{MARITAL_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {field('Date of Birth', 'date_of_birth', 'date')}
          {field('Phone Number', 'phone_number', 'tel')}
          {field('Email', 'email', 'email')}
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Address</Label>
            <Textarea value={form.address} onChange={e => set('address', e.target.value)} className="text-sm min-h-[60px]" />
          </div>
        </div>
      </div>

      {/* Identification */}
      <div>
        <h3 className="text-sm font-semibold text-primary mb-2 border-b border-border pb-1">Identification</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {field('BVN', 'bvn_number')}
          {field('NIN', 'nin_number')}
          {field('NHF Number', 'nhf_number')}
        </div>
      </div>

      {/* Employment Details */}
      <div>
        <h3 className="text-sm font-semibold text-primary mb-2 border-b border-border pb-1">Employment Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {field('Organization', 'department')}
          {field('Employer Number', 'employer_number')}
          {field('Staff ID', 'employee_id')}
          {field('Date of Employment', 'date_of_employment', 'date')}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">State</Label>
            <Select value={form.state} onValueChange={v => set('state', v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {field('Bank Branch', 'bank_branch')}
          {field('Loan Reference No.', 'loan_reference_number')}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-2 border-t">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
