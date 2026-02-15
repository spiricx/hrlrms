import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Search, Eye, Download, Plus, Users, Pencil, ArrowRightLeft, Calendar, Clock, Cake, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { format, differenceInMonths, differenceInDays, addYears, isBefore, isAfter, startOfDay } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

const RETIREMENT_AGE = 60;
const RETIREMENT_ALERT_YEARS = 3;

const titleOptions = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Chief', 'Alhaji', 'Alhaja', 'Hon', 'Engr', 'Barr', 'Arc'];
const genderOptions = ['Male', 'Female'];
const maritalStatusOptions = ['Single', 'Married', 'Divorced', 'Widowed', 'Separated'];
const statusOptions = ['Active', 'Retired', 'Out of Service', 'Died in Active Service', 'Dismissal', 'Resigned', 'Transferred', 'Inactive'];

type StaffMember = {
  id: string; title: string; surname: string; first_name: string; other_names: string;
  staff_id: string; nhf_number: string; bvn_number: string; nin_number: string;
  state: string; branch: string; unit: string; department: string; designation: string;
  cadre: string; group_name: string; gender: string; marital_status: string;
  date_of_birth: string | null; phone: string; email: string; date_employed: string | null;
  status: string; status_date: string | null; status_reason: string; created_at: string;
};

type AuditLog = {
  id: string; staff_id: string; action: string; field_changed: string;
  old_value: string; new_value: string; modified_by: string; modified_at: string;
};

type StaffLeave = {
  id: string; staff_id: string; leave_year: number; start_date: string;
  end_date: string; days_entitled: number; days_used: number; status: string; notes: string;
};

type StaffTransfer = {
  id: string; staff_id: string; from_state: string; from_branch: string; from_department: string;
  from_unit: string; to_state: string; to_branch: string; to_department: string; to_unit: string;
  transfer_date: string; reason: string; status: string; created_at: string;
};

const emptyForm = {
  title: '', surname: '', first_name: '', other_names: '', staff_id: '',
  nhf_number: '', bvn_number: '', nin_number: '',
  state: '', branch: '', unit: '', department: '', designation: '',
  cadre: '', group_name: '', gender: '', marital_status: '', date_of_birth: '', phone: '',
  email: '', date_employed: '', status: 'Active', status_date: '', status_reason: '',
};

// --- Utility functions ---
function calcTenure(dateEmployed: string | null) {
  if (!dateEmployed) return null;
  const now = new Date();
  const hired = new Date(dateEmployed);
  const totalMonths = differenceInMonths(now, hired);
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 };
}

function calcRetirement(dob: string | null) {
  if (!dob) return null;
  const retireDate = addYears(new Date(dob), RETIREMENT_AGE);
  const now = new Date();
  if (isBefore(retireDate, now)) return { years: 0, months: 0, isPast: true, date: retireDate };
  const totalMonths = differenceInMonths(retireDate, now);
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12, isPast: false, date: retireDate };
}

function isNearRetirement(dob: string | null) {
  const r = calcRetirement(dob);
  if (!r || r.isPast) return false;
  return r.years < RETIREMENT_ALERT_YEARS;
}

function isUpcomingBirthday(dob: string | null, daysAhead = 3) {
  if (!dob) return false;
  const now = startOfDay(new Date());
  const bday = new Date(dob);
  const thisYearBday = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
  const diff = differenceInDays(thisYearBday, now);
  return diff >= 0 && diff <= daysAhead;
}

function isTodayBirthday(dob: string | null) {
  if (!dob) return false;
  const now = new Date();
  const bday = new Date(dob);
  return now.getMonth() === bday.getMonth() && now.getDate() === bday.getDate();
}

function buildProfileSections(s: StaffMember) {
  const tenure = calcTenure(s.date_employed);
  const retirement = calcRetirement(s.date_of_birth);
  return [
    { section: 'Personal Information', fields: [
      { label: 'Full Name', value: `${s.title} ${s.surname} ${s.first_name} ${s.other_names}`.trim() },
      { label: 'Staff ID', value: s.staff_id },
      { label: 'Title', value: s.title },
      { label: 'Surname', value: s.surname },
      { label: 'First Name', value: s.first_name },
      { label: 'Other Names', value: s.other_names },
      { label: 'Gender', value: s.gender },
      { label: 'Marital Status', value: s.marital_status },
      { label: 'Date of Birth', value: s.date_of_birth ? format(new Date(s.date_of_birth), 'dd-MMM-yyyy') : '' },
      { label: 'Phone Number', value: s.phone },
      { label: 'Email', value: s.email },
    ]},
    { section: 'Identification', fields: [
      { label: 'NHF Number', value: s.nhf_number },
      { label: 'BVN Number', value: s.bvn_number },
      { label: 'NIN', value: s.nin_number },
    ]},
    { section: 'Employment Details', fields: [
      { label: 'State', value: s.state },
      { label: 'Branch', value: s.branch },
      { label: 'Unit', value: s.unit },
      { label: 'Department', value: s.department },
      { label: 'Group', value: s.group_name },
      { label: 'Designation', value: s.designation },
      { label: 'Cadre/Grade Level', value: s.cadre },
      { label: 'Date Employed', value: s.date_employed ? format(new Date(s.date_employed), 'dd-MMM-yyyy') : '' },
      { label: 'Status', value: s.status },
      { label: 'Status Date', value: s.status_date ? format(new Date(s.status_date), 'dd-MMM-yyyy') : '' },
      { label: 'Status Reason', value: s.status_reason },
    ]},
    { section: 'Service Tenure', fields: [
      { label: 'Time in Service', value: tenure ? `${tenure.years}y ${tenure.months}m` : '—' },
      { label: 'Time to Retirement', value: retirement ? (retirement.isPast ? 'Past retirement age' : `${retirement.years}y ${retirement.months}m`) : '—' },
      { label: 'Retirement Date', value: retirement ? format(retirement.date, 'dd-MMM-yyyy') : '—' },
    ]},
  ];
}

// --- CSS keyframe injection for RGB blink ---
const rgbBlinkStyle = document.getElementById('rgb-blink-style') || (() => {
  const s = document.createElement('style');
  s.id = 'rgb-blink-style';
  s.textContent = `
    @keyframes rgb-blink { 0%{background:#ff000030} 33%{background:#00ff0030} 66%{background:#0000ff30} 100%{background:#ff000030} }
    .rgb-blink { animation: rgb-blink 1.5s infinite; }
    @keyframes retire-blink { 0%{opacity:1} 50%{opacity:0.3} 100%{opacity:1} }
    .retire-blink { animation: retire-blink 1s infinite; background: hsl(0 84% 60% / 0.15); }
  `;
  document.head.appendChild(s);
  return s;
})();

export default function StaffDirectory() {
  const { user, roles } = useAuth();
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState('all');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterDesignation, setFilterDesignation] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [profileTab, setProfileTab] = useState('details');
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);

  // Transfer state
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferStaff, setTransferStaff] = useState<StaffMember | null>(null);
  const [transferForm, setTransferForm] = useState({ to_state: '', to_branch: '', to_department: '', to_unit: '', reason: '', transfer_date: '' });
  const [transfers, setTransfers] = useState<StaffTransfer[]>([]);

  // Leave state
  const [showLeave, setShowLeave] = useState(false);
  const [leaveStaff, setLeaveStaff] = useState<StaffMember | null>(null);
  const [leaveForm, setLeaveForm] = useState({ start_date: '', end_date: '', days_entitled: '21', notes: '' });
  const [leaves, setLeaves] = useState<StaffLeave[]>([]);

  // Audit state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const isAdmin = roles.includes('admin');
  const canEdit = isAdmin || roles.includes('loan_officer');

  const fetchStaff = async () => {
    setLoading(true);
    const { data } = await supabase.from('staff_members').select('*').order('surname');
    setStaff((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchStaff(); }, []);

  useEffect(() => {
    const channel = supabase.channel('staff-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_members' }, () => fetchStaff())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Fetch related data when a staff is selected for profile view
  const fetchProfileData = useCallback(async (staffId: string) => {
    const [auditRes, leaveRes, transferRes] = await Promise.all([
      supabase.from('staff_audit_logs').select('*').eq('staff_id', staffId).order('modified_at', { ascending: false }).limit(50),
      supabase.from('staff_leaves').select('*').eq('staff_id', staffId).order('start_date', { ascending: false }),
      supabase.from('staff_transfers').select('*').eq('staff_id', staffId).order('transfer_date', { ascending: false }),
    ]);
    setAuditLogs((auditRes.data as any[]) || []);
    setLeaves((leaveRes.data as any[]) || []);
    setTransfers((transferRes.data as any[]) || []);
  }, []);

  useEffect(() => {
    if (selected) {
      fetchProfileData(selected.id);
      setProfileTab('details');
    }
  }, [selected, fetchProfileData]);

  const branches = useMemo(() => [...new Set(staff.map(s => s.branch).filter(Boolean))].sort(), [staff]);
  const departments = useMemo(() => [...new Set(staff.map(s => s.department).filter(Boolean))].sort(), [staff]);
  const designations = useMemo(() => [...new Set(staff.map(s => s.designation).filter(Boolean))].sort(), [staff]);

  const filtered = useMemo(() => {
    return staff.filter(s => {
      const q = search.toLowerCase();
      const matchSearch = !q || [s.surname, s.first_name, s.other_names, s.staff_id, s.email, s.phone, s.designation, s.nhf_number, s.bvn_number, s.nin_number]
        .some(v => v?.toLowerCase().includes(q));
      const matchState = filterState === 'all' || s.state === filterState;
      const matchBranch = !filterBranch || s.branch === filterBranch;
      const matchDept = !filterDept || s.department === filterDept;
      const matchDesig = !filterDesignation || s.designation === filterDesignation;
      const matchStatus = filterStatus === 'all' || s.status.toLowerCase() === filterStatus.toLowerCase();
      return matchSearch && matchState && matchBranch && matchDept && matchDesig && matchStatus;
    });
  }, [staff, search, filterState, filterBranch, filterDept, filterDesignation, filterStatus]);

  // Birthday alerts
  const upcomingBirthdays = useMemo(() => staff.filter(s => isUpcomingBirthday(s.date_of_birth)), [staff]);

  const handleChange = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // --- Audit log helper ---
  const logChanges = async (staffId: string, oldData: Record<string, any>, newData: Record<string, any>) => {
    const fields = Object.keys(newData);
    const logs: any[] = [];
    for (const f of fields) {
      const oldVal = String(oldData[f] ?? '');
      const newVal = String(newData[f] ?? '');
      if (oldVal !== newVal) {
        logs.push({
          staff_id: staffId,
          action: 'update',
          field_changed: f,
          old_value: oldVal,
          new_value: newVal,
          modified_by: user?.id,
        });
      }
    }
    if (logs.length > 0) {
      await supabase.from('staff_audit_logs').insert(logs as any);
    }
  };

  const handleSubmit = async () => {
    if (!form.surname || !form.first_name || !form.staff_id) {
      toast({ title: 'Missing fields', description: 'Surname, First Name and Staff ID are required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const payload = {
      title: form.title, surname: form.surname, first_name: form.first_name,
      other_names: form.other_names, staff_id: form.staff_id,
      nhf_number: form.nhf_number, bvn_number: form.bvn_number, nin_number: form.nin_number,
      state: form.state, branch: form.branch, unit: form.unit,
      department: form.department, designation: form.designation,
      cadre: form.cadre, group_name: form.group_name,
      gender: form.gender, marital_status: form.marital_status,
      date_of_birth: form.date_of_birth || null, phone: form.phone, email: form.email,
      date_employed: form.date_employed || null, status: form.status,
      status_date: form.status_date || null, status_reason: form.status_reason,
      created_by: user?.id,
    };
    const { data, error } = await supabase.from('staff_members').insert(payload as any).select().single();
    setSubmitting(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      // Log creation
      if (data) {
        await supabase.from('staff_audit_logs').insert({
          staff_id: (data as any).id, action: 'create', field_changed: 'record',
          old_value: '', new_value: 'Created new staff record', modified_by: user?.id,
        } as any);
      }
      toast({ title: 'Staff member added' });
      setShowAdd(false);
      setForm({ ...emptyForm });
      fetchStaff();
    }
  };

  const openEdit = (s: StaffMember) => {
    setEditingStaff(s);
    setForm({
      title: s.title || '', surname: s.surname || '', first_name: s.first_name || '',
      other_names: s.other_names || '', staff_id: s.staff_id || '',
      nhf_number: s.nhf_number || '', bvn_number: s.bvn_number || '', nin_number: s.nin_number || '',
      state: s.state || '', branch: s.branch || '', unit: s.unit || '',
      department: s.department || '', designation: s.designation || '',
      cadre: s.cadre || '', group_name: s.group_name || '',
      gender: s.gender || '', marital_status: s.marital_status || '',
      date_of_birth: s.date_of_birth || '', phone: s.phone || '', email: s.email || '',
      date_employed: s.date_employed || '', status: s.status || 'Active',
      status_date: s.status_date || '', status_reason: s.status_reason || '',
    });
    setShowEdit(true);
  };

  const handleUpdate = async () => {
    if (!editingStaff) return;
    if (!form.surname || !form.first_name || !form.staff_id) {
      toast({ title: 'Missing fields', description: 'Surname, First Name and Staff ID are required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const payload = {
      title: form.title, surname: form.surname, first_name: form.first_name,
      other_names: form.other_names, staff_id: form.staff_id,
      nhf_number: form.nhf_number, bvn_number: form.bvn_number, nin_number: form.nin_number,
      state: form.state, branch: form.branch, unit: form.unit,
      department: form.department, designation: form.designation,
      cadre: form.cadre, group_name: form.group_name,
      gender: form.gender, marital_status: form.marital_status,
      date_of_birth: form.date_of_birth || null, phone: form.phone, email: form.email,
      date_employed: form.date_employed || null, status: form.status,
      status_date: form.status_date || null, status_reason: form.status_reason,
    };
    const { error } = await supabase.from('staff_members').update(payload as any).eq('id', editingStaff.id);
    if (!error) {
      await logChanges(editingStaff.id, editingStaff, payload);
    }
    setSubmitting(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Staff record updated' });
      setShowEdit(false);
      setEditingStaff(null);
      setForm({ ...emptyForm });
      fetchStaff();
    }
  };

  // --- Transfer ---
  const openTransfer = (s: StaffMember) => {
    setTransferStaff(s);
    setTransferForm({ to_state: '', to_branch: '', to_department: '', to_unit: '', reason: '', transfer_date: format(new Date(), 'yyyy-MM-dd') });
    setShowTransfer(true);
  };

  const handleTransfer = async () => {
    if (!transferStaff || !transferForm.to_state) {
      toast({ title: 'Missing fields', description: 'At least a new state is required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('staff_transfers').insert({
      staff_id: transferStaff.id,
      from_state: transferStaff.state, from_branch: transferStaff.branch,
      from_department: transferStaff.department || '', from_unit: transferStaff.unit || '',
      to_state: transferForm.to_state, to_branch: transferForm.to_branch,
      to_department: transferForm.to_department, to_unit: transferForm.to_unit,
      transfer_date: transferForm.transfer_date || new Date().toISOString().slice(0, 10),
      reason: transferForm.reason, status: 'approved',
      created_by: user?.id,
    } as any);
    if (!error) {
      // Auto-update staff record with new assignment
      await supabase.from('staff_members').update({
        state: transferForm.to_state,
        branch: transferForm.to_branch || transferStaff.branch,
        department: transferForm.to_department || transferStaff.department,
        unit: transferForm.to_unit || transferStaff.unit,
        status: 'Transferred',
        status_date: transferForm.transfer_date,
        status_reason: transferForm.reason || 'Staff transfer',
      } as any).eq('id', transferStaff.id);
      // Audit log
      await supabase.from('staff_audit_logs').insert({
        staff_id: transferStaff.id, action: 'transfer',
        field_changed: 'state/branch/dept/unit',
        old_value: `${transferStaff.state}/${transferStaff.branch}/${transferStaff.department}/${transferStaff.unit}`,
        new_value: `${transferForm.to_state}/${transferForm.to_branch}/${transferForm.to_department}/${transferForm.to_unit}`,
        modified_by: user?.id,
      } as any);
    }
    setSubmitting(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Transfer initiated and applied' });
      setShowTransfer(false);
      setTransferStaff(null);
      fetchStaff();
    }
  };

  // --- Leave ---
  const openLeave = (s: StaffMember) => {
    setLeaveStaff(s);
    setLeaveForm({ start_date: '', end_date: '', days_entitled: '21', notes: '' });
    setShowLeave(true);
  };

  const handleLeave = async () => {
    if (!leaveStaff || !leaveForm.start_date || !leaveForm.end_date) {
      toast({ title: 'Missing fields', description: 'Start and end dates are required', variant: 'destructive' });
      return;
    }
    const daysUsed = differenceInDays(new Date(leaveForm.end_date), new Date(leaveForm.start_date)) + 1;
    setSubmitting(true);
    const { error } = await supabase.from('staff_leaves').insert({
      staff_id: leaveStaff.id,
      leave_year: new Date(leaveForm.start_date).getFullYear(),
      start_date: leaveForm.start_date,
      end_date: leaveForm.end_date,
      days_entitled: parseInt(leaveForm.days_entitled) || 21,
      days_used: daysUsed,
      status: 'approved',
      notes: leaveForm.notes,
      created_by: user?.id,
    } as any);
    setSubmitting(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Leave recorded' });
      setShowLeave(false);
      setLeaveStaff(null);
      if (selected) fetchProfileData(selected.id);
    }
  };

  // --- Export helpers ---
  const exportExcel = () => {
    const rows = filtered.map((s, i) => ({
      'S/N': i + 1, Title: s.title, Surname: s.surname, 'First Name': s.first_name,
      'Other Names': s.other_names, 'Staff ID': s.staff_id,
      'NHF Number': s.nhf_number, 'BVN': s.bvn_number, 'NIN': s.nin_number,
      State: s.state, Branch: s.branch, Unit: s.unit, Department: s.department,
      Designation: s.designation, Cadre: s.cadre, Gender: s.gender, Phone: s.phone,
      Email: s.email, Status: s.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff');
    XLSX.writeFile(wb, 'Staff_Directory.xlsx');
  };

  const exportPDF = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('Staff Directory', 40, 40);
    autoTable(doc, {
      startY: 60,
      head: [['S/N', 'Title', 'Surname', 'First Name', 'Staff ID', 'NHF No.', 'BVN', 'NIN', 'State', 'Branch', 'Department', 'Designation', 'Cadre', 'Status']],
      body: filtered.map((s, i) => [i + 1, s.title, s.surname, s.first_name, s.staff_id, s.nhf_number, s.bvn_number, s.nin_number, s.state, s.branch, s.department, s.designation, s.cadre, s.status]),
      styles: { fontSize: 7 },
    });
    doc.save('Staff_Directory.pdf');
  };

  const exportIndividualPDF = (s: StaffMember) => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const fullName = `${s.title} ${s.surname} ${s.first_name} ${s.other_names}`.trim();
    doc.setFontSize(16);
    doc.text(`Staff Profile – ${fullName}`, 40, 40);
    let y = 60;
    buildProfileSections(s).forEach(sec => {
      autoTable(doc, {
        startY: y,
        head: [[sec.section, '']],
        body: sec.fields.map(f => [f.label, f.value]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [0, 100, 60] },
        margin: { left: 40, right: 40 },
      });
      y = (doc as any).lastAutoTable.finalY + 12;
    });
    doc.save(`Staff_Profile_${s.staff_id}.pdf`);
  };

  const printStaff = (s: StaffMember) => {
    const fullName = `${s.title} ${s.surname} ${s.first_name} ${s.other_names}`.trim();
    const sections = buildProfileSections(s);
    const html = `<html><head><title>${fullName}</title><style>
      body{font-family:Arial;padding:30px}h1{font-size:18px}h2{font-size:14px;margin-top:20px;border-bottom:1px solid #ccc}
      table{width:100%;border-collapse:collapse;margin-top:8px}td{padding:6px 10px;border:1px solid #ddd;font-size:12px}
      td:first-child{font-weight:bold;width:40%;background:#f9f9f9}
    </style></head><body><h1>Staff Profile – ${fullName}</h1>
    ${sections.map(s => `<h2>${s.section}</h2><table>${s.fields.map(f => `<tr><td>${f.label}</td><td>${f.value}</td></tr>`).join('')}</table>`).join('')}
    </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const statusColor = (s: string) => {
    const l = s.toLowerCase();
    if (l === 'active') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    if (l === 'retired') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    if (l === 'out of service') return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    if (l === 'died in active service') return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    if (l === 'dismissal') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if (l === 'resigned') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    if (l === 'inactive') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  };

  // --- Render form fields (shared between Add/Edit) ---
  const renderFormFields = () => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1">
        <Label>Title</Label>
        <Select value={form.title} onValueChange={v => handleChange('title', v)}>
          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>{titleOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1"><Label>Surname *</Label><Input value={form.surname} onChange={e => handleChange('surname', e.target.value)} /></div>
      <div className="space-y-1"><Label>First Name *</Label><Input value={form.first_name} onChange={e => handleChange('first_name', e.target.value)} /></div>
      <div className="space-y-1"><Label>Other Names</Label><Input value={form.other_names} onChange={e => handleChange('other_names', e.target.value)} /></div>
      <div className="space-y-1"><Label>Staff ID *</Label><Input value={form.staff_id} onChange={e => handleChange('staff_id', e.target.value)} placeholder="e.g. STF-LAS-001" /></div>
      <div className="space-y-1"><Label>NHF Number</Label><Input value={form.nhf_number} onChange={e => handleChange('nhf_number', e.target.value)} placeholder="NHF Account No." /></div>
      <div className="space-y-1"><Label>BVN Number</Label><Input value={form.bvn_number} onChange={e => handleChange('bvn_number', e.target.value)} placeholder="11-digit BVN" maxLength={11} /></div>
      <div className="space-y-1"><Label>NIN</Label><Input value={form.nin_number} onChange={e => handleChange('nin_number', e.target.value)} placeholder="11-digit NIN" maxLength={11} /></div>
      <div className="space-y-1">
        <Label>Gender</Label>
        <Select value={form.gender} onValueChange={v => handleChange('gender', v)}>
          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>{genderOptions.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Marital Status</Label>
        <Select value={form.marital_status} onValueChange={v => handleChange('marital_status', v)}>
          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>{maritalStatusOptions.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1"><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth} onChange={e => handleChange('date_of_birth', e.target.value)} /></div>
      <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={e => handleChange('phone', e.target.value)} /></div>
      <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} /></div>
      <div className="space-y-1">
        <Label>State</Label>
        <Select value={form.state} onValueChange={v => handleChange('state', v)}>
          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>{NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1"><Label>Branch</Label><Input value={form.branch} onChange={e => handleChange('branch', e.target.value)} /></div>
      <div className="space-y-1"><Label>Unit</Label><Input value={form.unit} onChange={e => handleChange('unit', e.target.value)} /></div>
      <div className="space-y-1"><Label>Department</Label><Input value={form.department} onChange={e => handleChange('department', e.target.value)} /></div>
      <div className="space-y-1"><Label>Group</Label><Input value={form.group_name} onChange={e => handleChange('group_name', e.target.value)} /></div>
      <div className="space-y-1"><Label>Designation</Label><Input value={form.designation} onChange={e => handleChange('designation', e.target.value)} /></div>
      <div className="space-y-1"><Label>Cadre/Grade Level</Label><Input value={form.cadre} onChange={e => handleChange('cadre', e.target.value)} placeholder="e.g. GL 12" /></div>
      <div className="space-y-1"><Label>Date Employed</Label><Input type="date" value={form.date_employed} onChange={e => handleChange('date_employed', e.target.value)} /></div>
      <div className="space-y-1">
        <Label>Status</Label>
        <Select value={form.status} onValueChange={v => handleChange('status', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{statusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1"><Label>Status/Event Date</Label><Input type="date" value={form.status_date} onChange={e => handleChange('status_date', e.target.value)} /></div>
      <div className="space-y-1"><Label>Status Reason</Label><Input value={form.status_reason} onChange={e => handleChange('status_reason', e.target.value)} placeholder="e.g. Voluntary resignation" /></div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><Users className="w-6 h-6 text-primary" /> All Staff Members</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} staff member{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={exportExcel}><Download className="w-4 h-4 mr-1" />Excel</Button>
          <Button size="sm" variant="outline" onClick={exportPDF}><Download className="w-4 h-4 mr-1" />PDF</Button>
          {canEdit && <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Staff</Button>}
        </div>
      </div>

      {/* Birthday Alerts Banner */}
      {upcomingBirthdays.length > 0 && (
        <Card className="rgb-blink border-2">
          <CardContent className="py-3 flex items-center gap-3">
            <Cake className="w-6 h-6 text-pink-500" />
            <div>
              <p className="font-semibold text-sm">🎂 Upcoming Birthdays!</p>
              <p className="text-xs text-muted-foreground">
                {upcomingBirthdays.map(s => {
                  const bd = isTodayBirthday(s.date_of_birth);
                  return (
                    <span key={s.id} className="mr-3">
                      {bd ? '🎉' : '🔔'} {s.title} {s.surname} {s.first_name}
                      {s.date_of_birth ? ` — ${format(new Date(new Date(s.date_of_birth).getFullYear() === new Date().getFullYear() ? s.date_of_birth : new Date(new Date().getFullYear(), new Date(s.date_of_birth).getMonth(), new Date(s.date_of_birth).getDate())), 'dd MMM')}` : ''}
                      {bd ? ' (TODAY!)' : ''}
                    </span>
                  );
                })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search name, ID, NHF, BVN, NIN…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filterState} onValueChange={setFilterState}>
              <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterBranch || 'all'} onValueChange={v => setFilterBranch(v === 'all' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Branch" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterDept || 'all'} onValueChange={v => setFilterDept(v === 'all' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {statusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[65vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                <tr>
                  {['#', 'Name', 'Staff ID', 'State', 'Branch', 'Dept', 'Designation', 'Status', 'In Service', 'To Retire', 'Event Date', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={12} className="py-12 text-center text-muted-foreground">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={12} className="py-12 text-center text-muted-foreground">No staff members found</td></tr>
                ) : filtered.map((s, i) => {
                  const tenure = calcTenure(s.date_employed);
                  const retirement = calcRetirement(s.date_of_birth);
                  const nearRetire = isNearRetirement(s.date_of_birth);
                  const bdaySoon = isUpcomingBirthday(s.date_of_birth);
                  return (
                    <tr key={s.id} className={`border-b table-row-highlight ${nearRetire ? 'retire-blink' : ''} ${bdaySoon ? 'rgb-blink' : ''}`}>
                      <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="font-medium">{s.title} {s.surname} {s.first_name}</div>
                        <div className="text-xs text-muted-foreground">{s.email}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{s.staff_id}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{s.state}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{s.branch}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{s.department}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{s.designation}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(s.status)}`}>{s.status}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                        {tenure ? <span className="font-medium">{tenure.years}y {tenure.months}m</span> : '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                        {retirement ? (
                          retirement.isPast ? (
                            <span className="text-destructive font-bold">Past</span>
                          ) : (
                            <span className={nearRetire ? 'text-destructive font-bold' : ''}>
                              {retirement.years}y {retirement.months}m
                              {nearRetire && <span className="ml-1">⚠️</span>}
                            </span>
                          )
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                        {s.status_date ? format(new Date(s.status_date), 'dd-MMM-yyyy') : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-0.5">
                          <Button size="sm" variant="ghost" onClick={() => setSelected(s)} title="View Profile"><Eye className="w-4 h-4" /></Button>
                          {canEdit && <Button size="sm" variant="ghost" onClick={() => openEdit(s)} title="Edit"><Pencil className="w-4 h-4" /></Button>}
                          {isAdmin && <Button size="sm" variant="ghost" onClick={() => openTransfer(s)} title="Transfer"><ArrowRightLeft className="w-4 h-4" /></Button>}
                          {canEdit && <Button size="sm" variant="ghost" onClick={() => openLeave(s)} title="Leave"><Calendar className="w-4 h-4" /></Button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Profile Dialog with Tabs */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg flex items-center gap-2">
                  Staff Profile – {selected.title} {selected.surname} {selected.first_name}
                  {isNearRetirement(selected.date_of_birth) && <span className="text-destructive animate-pulse text-sm">⚠️ Near Retirement</span>}
                </DialogTitle>
              </DialogHeader>
              <Tabs value={profileTab} onValueChange={setProfileTab}>
                <TabsList className="mb-3">
                  <TabsTrigger value="details"><Eye className="w-3 h-3 mr-1" />Details</TabsTrigger>
                  <TabsTrigger value="leaves"><Calendar className="w-3 h-3 mr-1" />Leave</TabsTrigger>
                  <TabsTrigger value="transfers"><ArrowRightLeft className="w-3 h-3 mr-1" />Transfers</TabsTrigger>
                  <TabsTrigger value="history"><History className="w-3 h-3 mr-1" />Audit Log</TabsTrigger>
                </TabsList>

                <TabsContent value="details">
                  <div className="space-y-4">
                    {buildProfileSections(selected).map(sec => (
                      <div key={sec.section}>
                        <h3 className="text-sm font-bold text-primary mb-2">{sec.section}</h3>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                          {sec.fields.map(f => (
                            <div key={f.label} className="flex gap-2 text-sm">
                              <span className="text-muted-foreground min-w-[130px]">{f.label}:</span>
                              <span className="font-medium">{f.value || '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-3">
                    <Button size="sm" variant="outline" onClick={() => exportIndividualPDF(selected)}>Export PDF</Button>
                    <Button size="sm" variant="outline" onClick={() => printStaff(selected)}>Print</Button>
                    {canEdit && <Button size="sm" onClick={() => { setSelected(null); openEdit(selected); }}>Edit Record</Button>}
                    {isAdmin && <Button size="sm" variant="secondary" onClick={() => { setSelected(null); openTransfer(selected); }}>Initiate Transfer</Button>}
                  </div>
                </TabsContent>

                <TabsContent value="leaves">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold text-primary">Annual Leave Records</h3>
                      {canEdit && <Button size="sm" onClick={() => { setSelected(null); openLeave(selected); }}><Plus className="w-3 h-3 mr-1" />Add Leave</Button>}
                    </div>
                    {leaves.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No leave records found</p>
                    ) : (
                      <div className="space-y-2">
                        {leaves.map(l => (
                          <div key={l.id} className="border rounded-lg p-3 text-sm">
                            <div className="flex justify-between">
                              <span className="font-medium">{l.leave_year} Annual Leave</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${l.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{l.status}</span>
                            </div>
                            <div className="text-muted-foreground mt-1">
                              {format(new Date(l.start_date), 'dd-MMM-yyyy')} → {format(new Date(l.end_date), 'dd-MMM-yyyy')}
                            </div>
                            <div className="flex gap-4 mt-1 text-xs">
                              <span>Entitled: {l.days_entitled} days</span>
                              <span>Used: {l.days_used} days</span>
                              <span className="font-semibold">Remaining: {l.days_entitled - l.days_used} days</span>
                            </div>
                            {l.notes && <p className="text-xs text-muted-foreground mt-1">{l.notes}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="transfers">
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-primary">Transfer History</h3>
                    {transfers.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No transfer records found</p>
                    ) : (
                      <div className="space-y-2">
                        {transfers.map(t => (
                          <div key={t.id} className="border rounded-lg p-3 text-sm">
                            <div className="flex justify-between">
                              <span className="font-medium">{format(new Date(t.transfer_date), 'dd-MMM-yyyy')}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{t.status}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">From:</span>
                                <p>{t.from_state} / {t.from_branch} / {t.from_department}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">To:</span>
                                <p>{t.to_state} / {t.to_branch} / {t.to_department}</p>
                              </div>
                            </div>
                            {t.reason && <p className="text-xs text-muted-foreground mt-1">Reason: {t.reason}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="history">
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-primary flex items-center gap-2"><Clock className="w-4 h-4" /> Modification History</h3>
                    {auditLogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No modification history found</p>
                    ) : (
                      <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                        {auditLogs.map(log => (
                          <div key={log.id} className="border rounded-lg p-2.5 text-xs">
                            <div className="flex justify-between">
                              <span className="font-medium capitalize">{log.action}: <span className="text-primary">{log.field_changed}</span></span>
                              <span className="text-muted-foreground">{format(new Date(log.modified_at), 'dd-MMM-yyyy HH:mm')}</span>
                            </div>
                            {log.old_value && log.new_value && log.action === 'update' && (
                              <div className="flex gap-2 mt-1">
                                <span className="line-through text-destructive/70">{log.old_value}</span>
                                <span>→</span>
                                <span className="text-emerald-600 font-medium">{log.new_value}</span>
                              </div>
                            )}
                            {log.action !== 'update' && log.new_value && (
                              <p className="text-muted-foreground mt-0.5">{log.new_value}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Staff Dialog */}
      <Dialog open={showAdd || showEdit} onOpenChange={open => { if (!open) { setShowAdd(false); setShowEdit(false); setEditingStaff(null); setForm({ ...emptyForm }); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{showEdit ? 'Edit Staff Member' : 'Add New Staff Member'}</DialogTitle></DialogHeader>
          {renderFormFields()}
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => { setShowAdd(false); setShowEdit(false); setEditingStaff(null); setForm({ ...emptyForm }); }}>Cancel</Button>
            <Button onClick={showEdit ? handleUpdate : handleSubmit} disabled={submitting}>
              {submitting ? 'Saving…' : showEdit ? 'Update Staff' : 'Add Staff'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={showTransfer} onOpenChange={open => { if (!open) { setShowTransfer(false); setTransferStaff(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="w-5 h-5" /> Initiate Transfer</DialogTitle>
          </DialogHeader>
          {transferStaff && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Transferring <strong>{transferStaff.title} {transferStaff.surname} {transferStaff.first_name}</strong> from {transferStaff.state} / {transferStaff.branch}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>New State *</Label>
                  <Select value={transferForm.to_state} onValueChange={v => setTransferForm(f => ({ ...f, to_state: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                    <SelectContent>{NIGERIA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>New Branch</Label><Input value={transferForm.to_branch} onChange={e => setTransferForm(f => ({ ...f, to_branch: e.target.value }))} /></div>
                <div className="space-y-1"><Label>New Department</Label><Input value={transferForm.to_department} onChange={e => setTransferForm(f => ({ ...f, to_department: e.target.value }))} /></div>
                <div className="space-y-1"><Label>New Unit</Label><Input value={transferForm.to_unit} onChange={e => setTransferForm(f => ({ ...f, to_unit: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Transfer Date</Label><Input type="date" value={transferForm.transfer_date} onChange={e => setTransferForm(f => ({ ...f, transfer_date: e.target.value }))} /></div>
              </div>
              <div className="space-y-1"><Label>Reason</Label><Textarea value={transferForm.reason} onChange={e => setTransferForm(f => ({ ...f, reason: e.target.value }))} placeholder="Reason for transfer" /></div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setShowTransfer(false); setTransferStaff(null); }}>Cancel</Button>
                <Button onClick={handleTransfer} disabled={submitting}>{submitting ? 'Processing…' : 'Confirm Transfer'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Leave Dialog */}
      <Dialog open={showLeave} onOpenChange={open => { if (!open) { setShowLeave(false); setLeaveStaff(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" /> Record Annual Leave</DialogTitle>
          </DialogHeader>
          {leaveStaff && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Leave for <strong>{leaveStaff.title} {leaveStaff.surname} {leaveStaff.first_name}</strong>
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Start Date *</Label><Input type="date" value={leaveForm.start_date} onChange={e => setLeaveForm(f => ({ ...f, start_date: e.target.value }))} /></div>
                <div className="space-y-1"><Label>End Date *</Label><Input type="date" value={leaveForm.end_date} onChange={e => setLeaveForm(f => ({ ...f, end_date: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Days Entitled</Label><Input type="number" value={leaveForm.days_entitled} onChange={e => setLeaveForm(f => ({ ...f, days_entitled: e.target.value }))} /></div>
              </div>
              <div className="space-y-1"><Label>Notes</Label><Textarea value={leaveForm.notes} onChange={e => setLeaveForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" /></div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setShowLeave(false); setLeaveStaff(null); }}>Cancel</Button>
                <Button onClick={handleLeave} disabled={submitting}>{submitting ? 'Saving…' : 'Record Leave'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
