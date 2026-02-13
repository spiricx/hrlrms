import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, Eye, Download, Plus, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

const titleOptions = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Chief', 'Alhaji', 'Alhaja', 'Hon', 'Engr', 'Barr', 'Arc'];
const genderOptions = ['Male', 'Female'];
const statusOptions = ['Active', 'Inactive', 'Transferred'];

type StaffMember = {
  id: string;
  title: string;
  surname: string;
  first_name: string;
  other_names: string;
  staff_id: string;
  state: string;
  branch: string;
  unit: string;
  department: string;
  designation: string;
  cadre: string;
  group_name: string;
  gender: string;
  date_of_birth: string | null;
  phone: string;
  email: string;
  date_employed: string | null;
  status: string;
  created_at: string;
};

const emptyForm = {
  title: '', surname: '', first_name: '', other_names: '', staff_id: '',
  state: '', branch: '', unit: '', department: '', designation: '',
  cadre: '', group_name: '', gender: '', date_of_birth: '', phone: '',
  email: '', date_employed: '', status: 'Active',
};

function buildProfileSections(s: StaffMember) {
  return [
    { section: 'Personal Information', fields: [
      { label: 'Full Name', value: `${s.title} ${s.surname} ${s.first_name} ${s.other_names}`.trim() },
      { label: 'Staff ID', value: s.staff_id },
      { label: 'Title', value: s.title },
      { label: 'Surname', value: s.surname },
      { label: 'First Name', value: s.first_name },
      { label: 'Other Names', value: s.other_names },
      { label: 'Gender', value: s.gender },
      { label: 'Date of Birth', value: s.date_of_birth ? format(new Date(s.date_of_birth), 'dd-MMM-yyyy') : '' },
      { label: 'Phone Number', value: s.phone },
      { label: 'Email', value: s.email },
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
    ]},
  ];
}

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
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);

  const canEdit = roles.includes('admin') || roles.includes('loan_officer');

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

  const branches = useMemo(() => [...new Set(staff.map(s => s.branch).filter(Boolean))].sort(), [staff]);
  const departments = useMemo(() => [...new Set(staff.map(s => s.department).filter(Boolean))].sort(), [staff]);
  const designations = useMemo(() => [...new Set(staff.map(s => s.designation).filter(Boolean))].sort(), [staff]);

  const filtered = useMemo(() => {
    return staff.filter(s => {
      const q = search.toLowerCase();
      const matchSearch = !q || [s.surname, s.first_name, s.other_names, s.staff_id, s.email, s.phone, s.designation]
        .some(v => v?.toLowerCase().includes(q));
      const matchState = filterState === 'all' || s.state === filterState;
      const matchBranch = !filterBranch || s.branch === filterBranch;
      const matchDept = !filterDept || s.department === filterDept;
      const matchDesig = !filterDesignation || s.designation === filterDesignation;
      const matchStatus = filterStatus === 'all' || s.status.toLowerCase() === filterStatus.toLowerCase();
      return matchSearch && matchState && matchBranch && matchDept && matchDesig && matchStatus;
    });
  }, [staff, search, filterState, filterBranch, filterDept, filterDesignation, filterStatus]);

  const handleChange = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.surname || !form.first_name || !form.staff_id) {
      toast({ title: 'Missing fields', description: 'Surname, First Name and Staff ID are required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('staff_members').insert({
      title: form.title,
      surname: form.surname,
      first_name: form.first_name,
      other_names: form.other_names,
      staff_id: form.staff_id,
      state: form.state,
      branch: form.branch,
      unit: form.unit,
      department: form.department,
      designation: form.designation,
      cadre: form.cadre,
      group_name: form.group_name,
      gender: form.gender,
      date_of_birth: form.date_of_birth || null,
      phone: form.phone,
      email: form.email,
      date_employed: form.date_employed || null,
      status: form.status,
      created_by: user?.id,
    } as any);
    setSubmitting(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Staff member added' });
      setShowAdd(false);
      setForm({ ...emptyForm });
      fetchStaff();
    }
  };

  // Export helpers
  const exportExcel = () => {
    const rows = filtered.map((s, i) => ({
      'S/N': i + 1, Title: s.title, Surname: s.surname, 'First Name': s.first_name,
      'Other Names': s.other_names, 'Staff ID': s.staff_id, State: s.state, Branch: s.branch,
      Unit: s.unit, Department: s.department, Designation: s.designation, Cadre: s.cadre,
      Gender: s.gender, Phone: s.phone, Email: s.email, Status: s.status,
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
      head: [['S/N', 'Title', 'Surname', 'First Name', 'Staff ID', 'State', 'Branch', 'Department', 'Designation', 'Cadre', 'Status']],
      body: filtered.map((s, i) => [i + 1, s.title, s.surname, s.first_name, s.staff_id, s.state, s.branch, s.department, s.designation, s.cadre, s.status]),
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
    if (l === 'inactive') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  };

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

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search name, ID, email…" value={search} onChange={e => setSearch(e.target.value)} />
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
                  {['#', 'Title', 'Surname', 'First Name', 'Other Names', 'Staff ID', 'State', 'Branch', 'Unit', 'Department', 'Designation', 'Cadre', 'Gender', 'Phone', 'Email', 'Status', 'Action'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={17} className="py-12 text-center text-muted-foreground">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={17} className="py-12 text-center text-muted-foreground">No staff members found</td></tr>
                ) : filtered.map((s, i) => (
                  <tr key={s.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{s.title}</td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{s.surname}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{s.first_name}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{s.other_names}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{s.staff_id}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{s.state}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{s.branch}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{s.unit}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{s.department}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{s.designation}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{s.cadre}</td>
                    <td className="px-3 py-2.5">{s.gender}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{s.phone}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{s.email}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(s.status)}`}>{s.status}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(s)}><Eye className="w-4 h-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Profile Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg">Staff Profile – {selected.title} {selected.surname} {selected.first_name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {buildProfileSections(selected).map(sec => (
                  <div key={sec.section}>
                    <h3 className="text-sm font-bold text-primary mb-2">{sec.section}</h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {sec.fields.map(f => (
                        <div key={f.label} className="flex gap-2 text-sm">
                          <span className="text-muted-foreground min-w-[120px]">{f.label}:</span>
                          <span className="font-medium">{f.value || '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => exportIndividualPDF(selected)}>Export PDF</Button>
                <Button size="sm" variant="outline" onClick={() => printStaff(selected)}>Print</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Staff Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add New Staff Member</DialogTitle></DialogHeader>
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
            <div className="space-y-1">
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={v => handleChange('gender', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{genderOptions.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
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
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Saving…' : 'Add Staff'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
