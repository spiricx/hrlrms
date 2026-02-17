import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Shield, Users, Lock, Database, UserCog, Search, Plus, Trash2, RefreshCw, Eye, EyeOff, KeyRound, Activity } from 'lucide-react';
import ModuleAccessTab from '@/components/admin/ModuleAccessTab';
import ActivityLogsTab from '@/components/admin/ActivityLogsTab';
import { format } from 'date-fns';

type AppRole = 'admin' | 'manager' | 'loan_officer';

interface UserWithRoles {
  user_id: string;
  email: string;
  full_name: string;
  surname: string;
  first_name: string;
  state: string;
  bank_branch: string;
  staff_id_no: string;
  roles: AppRole[];
}

interface AuditLog {
  id: string;
  staff_id: string;
  action: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  modified_at: string;
  modified_by: string | null;
}

// ─── Staff Control Tab ───
function StaffControlTab() {
  const [staffCount, setStaffCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [inactiveCount, setInactiveCount] = useState(0);
  const [stateBreakdown, setStateBreakdown] = useState<{ state: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    const [totalRes, activeRes, inactiveRes, stateRes] = await Promise.all([
      supabase.from('staff_members').select('id', { count: 'exact', head: true }),
      supabase.from('staff_members').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('staff_members').select('id', { count: 'exact', head: true }).neq('status', 'active'),
      supabase.from('staff_members').select('state'),
    ]);
    setStaffCount(totalRes.count || 0);
    setActiveCount(activeRes.count || 0);
    setInactiveCount(inactiveRes.count || 0);
    if (stateRes.data) {
      const map: Record<string, number> = {};
      stateRes.data.forEach((s: any) => { map[s.state || 'Unassigned'] = (map[s.state || 'Unassigned'] || 0) + 1; });
      setStateBreakdown(Object.entries(map).map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count));
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardDescription>Total Staff</CardDescription><CardTitle className="text-3xl">{loading ? '...' : staffCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Active</CardDescription><CardTitle className="text-3xl text-primary">{loading ? '...' : activeCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Inactive / Other</CardDescription><CardTitle className="text-3xl text-destructive">{loading ? '...' : inactiveCount}</CardTitle></CardHeader></Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Staff Distribution by State</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-muted-foreground">Loading...</p> : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {stateBreakdown.map((s) => (
                <div key={s.state} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <span className="text-sm font-medium truncate">{s.state}</span>
                  <Badge variant="secondary">{s.count}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Privileges & Roles Tab ───
function RolesTab() {
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<AppRole>('loan_officer');

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('user_id, email, full_name, surname, first_name, state, bank_branch, staff_id_no');
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    if (profiles && roles) {
      const roleMap: Record<string, AppRole[]> = {};
      roles.forEach((r: any) => { if (!roleMap[r.user_id]) roleMap[r.user_id] = []; roleMap[r.user_id].push(r.role); });
      setUsers(profiles.map((p: any) => ({ ...p, roles: roleMap[p.user_id] || [] })));
    }
    setLoading(false);
  };

  const addRole = async () => {
    if (!selectedUserId || !selectedRole) return;
    const { error } = await supabase.from('user_roles').insert({ user_id: selectedUserId, role: selectedRole });
    if (error) { toast.error(error.message); return; }
    toast.success('Role assigned successfully');
    setAddDialogOpen(false);
    fetchUsers();
  };

  const removeRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', role);
    if (error) { toast.error(error.message); return; }
    toast.success('Role removed');
    fetchUsers();
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return !q || u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q) || u.surname?.toLowerCase().includes(q);
  }).sort((a, b) => {
    const aIsAdmin = a.roles.includes('admin') ? 0 : 1;
    const bIsAdmin = b.roles.includes('admin') ? 0 : 1;
    return aIsAdmin - bIsAdmin;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Assign Role</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Assign Role to User</DialogTitle><DialogDescription>Select a user and the role to assign.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-4">
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                <SelectContent>{users.map((u) => (<SelectItem key={u.user_id} value={u.user_id}>{u.surname} {u.first_name} ({u.email})</SelectItem>))}</SelectContent>
              </Select>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="loan_officer">Loan Officer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter><Button onClick={addRole}>Assign Role</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
                ) : filtered.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">{u.surname} {u.first_name}</TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell className="font-mono text-xs">{u.staff_id_no || '—'}</TableCell>
                    <TableCell className="text-sm">{u.state || '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 ? <span className="text-xs text-muted-foreground">No roles</span> :
                          u.roles.map((r) => (
                            <Badge key={r} variant={r === 'admin' ? 'destructive' : r === 'loan_officer' ? 'default' : 'secondary'} className="text-xs capitalize">
                              {r.replace('_', ' ')}
                            </Badge>
                          ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {u.roles.map((r) => (
                        <Button key={r} variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => removeRole(u.user_id, r)} title={`Remove ${r}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Access Control Tab ───
function AccessControlTab() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase.from('profiles').select('user_id, email, full_name, surname, first_name, state, bank_branch, staff_id_no');
      const { data: roles } = await supabase.from('user_roles').select('user_id, role');
      const roleMap: Record<string, string[]> = {};
      roles?.forEach((r: any) => { if (!roleMap[r.user_id]) roleMap[r.user_id] = []; roleMap[r.user_id].push(r.role); });
      setProfiles((data || []).map((p: any) => ({ ...p, roles: roleMap[p.user_id] || [] })).sort((a: any, b: any) => {
        const aIsAdmin = a.roles.includes('admin') ? 0 : 1;
        const bIsAdmin = b.roles.includes('admin') ? 0 : 1;
        return aIsAdmin - bIsAdmin;
      }));
      setLoading(false);
    };
    fetch();
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Regional Access Matrix</CardTitle>
          <CardDescription>Shows each user's geographic access scope. Admins have national access; others are limited to their assigned state/branch.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role(s)</TableHead>
                  <TableHead>Assigned State</TableHead>
                  <TableHead>Assigned Branch</TableHead>
                  <TableHead>Access Scope</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : profiles.map((p) => (
                  <TableRow key={p.user_id}>
                    <TableCell className="font-medium">{p.surname} {p.first_name}</TableCell>
                    <TableCell className="text-sm">{p.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.roles.map((r: string) => <Badge key={r} variant={r === 'admin' ? 'destructive' : 'secondary'} className="text-xs capitalize">{r.replace('_', ' ')}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell>{p.state || '—'}</TableCell>
                    <TableCell>{p.bank_branch || '—'}</TableCell>
                    <TableCell>
                      {p.roles.includes('admin') ? (
                        <Badge className="bg-primary text-primary-foreground">National</Badge>
                      ) : (
                        <Badge variant="outline">{p.state || 'Unassigned'}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Security Tab ───
function SecurityTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    setLoading(true);
    const { data } = await supabase.from('staff_audit_logs').select('*').order('modified_at', { ascending: false }).limit(100);
    setLogs(data || []);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Audit Trail</h3>
        <Button variant="outline" size="sm" onClick={fetchLogs}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Field Changed</TableHead>
                  <TableHead>Old Value</TableHead>
                  <TableHead>New Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : logs.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No audit logs found</TableCell></TableRow>
                ) : logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(log.modified_at), 'dd MMM yyyy HH:mm')}</TableCell>
                    <TableCell><Badge variant={log.action === 'delete' ? 'destructive' : 'secondary'} className="text-xs capitalize">{log.action}</Badge></TableCell>
                    <TableCell className="text-sm">{log.field_changed || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{log.old_value || '—'}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{log.new_value || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Backend Tab ───
function BackendTab() {
  const [stats, setStats] = useState<{ table: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    setLoading(true);
    const tables = ['beneficiaries', 'transactions', 'staff_members', 'loan_batches', 'batch_repayments', 'default_logs', 'profiles', 'user_roles', 'staff_transfers', 'staff_leaves', 'staff_audit_logs'] as const;
    const results = await Promise.all(
      tables.map(async (t) => {
        const { count } = await supabase.from(t).select('id', { count: 'exact', head: true });
        return { table: t, count: count || 0 };
      })
    );
    setStats(results);
    setLoading(false);
  };

  const tableLabels: Record<string, string> = {
    beneficiaries: 'Beneficiaries',
    transactions: 'Transactions',
    staff_members: 'Staff Members',
    loan_batches: 'Loan Batches',
    batch_repayments: 'Batch Repayments',
    default_logs: 'Default Logs',
    profiles: 'User Profiles',
    user_roles: 'User Roles',
    staff_transfers: 'Staff Transfers',
    staff_leaves: 'Staff Leaves',
    staff_audit_logs: 'Audit Logs',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Database Overview</h3>
        <Button variant="outline" size="sm" onClick={fetchStats}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardHeader className="pb-2"><CardDescription>Loading...</CardDescription><CardTitle className="text-2xl">...</CardTitle></CardHeader></Card>
          ))
        ) : stats.map((s) => (
          <Card key={s.table}>
            <CardHeader className="pb-2">
              <CardDescription className="capitalize">{tableLabels[s.table] || s.table}</CardDescription>
              <CardTitle className="text-2xl">{s.count.toLocaleString()}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground font-mono">{s.table}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Main Admin Page ───
export default function Admin() {
  const { hasRole, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">Loading...</div>;
  if (!hasRole('admin')) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display flex items-center gap-2"><Shield className="w-6 h-6 text-primary" /> Administration</h1>
        <p className="text-sm text-muted-foreground mt-1">System administration and configuration panel</p>
      </div>

      <Tabs defaultValue="staff-control" className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          <TabsTrigger value="staff-control" className="flex items-center gap-1.5"><UserCog className="w-4 h-4" /> Staff Control</TabsTrigger>
          <TabsTrigger value="access" className="flex items-center gap-1.5"><Eye className="w-4 h-4" /> Access Control</TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center gap-1.5"><Users className="w-4 h-4" /> Privileges & Roles</TabsTrigger>
          <TabsTrigger value="module-access" className="flex items-center gap-1.5"><KeyRound className="w-4 h-4" /> Module Access</TabsTrigger>
          <TabsTrigger value="activity-logs" className="flex items-center gap-1.5"><Activity className="w-4 h-4" /> Activity Logs</TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-1.5"><Lock className="w-4 h-4" /> Security</TabsTrigger>
          <TabsTrigger value="backend" className="flex items-center gap-1.5"><Database className="w-4 h-4" /> Backend</TabsTrigger>
        </TabsList>

        <TabsContent value="staff-control" className="mt-6"><StaffControlTab /></TabsContent>
        <TabsContent value="access" className="mt-6"><AccessControlTab /></TabsContent>
        <TabsContent value="roles" className="mt-6"><RolesTab /></TabsContent>
        <TabsContent value="module-access" className="mt-6"><ModuleAccessTab /></TabsContent>
        <TabsContent value="activity-logs" className="mt-6"><ActivityLogsTab /></TabsContent>
        <TabsContent value="security" className="mt-6"><SecurityTab /></TabsContent>
        <TabsContent value="backend" className="mt-6"><BackendTab /></TabsContent>
      </Tabs>
    </div>
  );
}
