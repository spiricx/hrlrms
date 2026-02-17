import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Search, RefreshCw, Save } from 'lucide-react';

export const MODULE_KEYS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'add-beneficiary', label: 'New Loan' },
  { key: 'bulk-upload', label: 'Bulk Loan Creation' },
  { key: 'beneficiaries', label: 'Beneficiaries' },
  { key: 'bio-data', label: 'Bio Data' },
  { key: 'loan-repayment', label: 'Loan Repayment' },
  { key: 'batch-repayment', label: 'Batch Repayment' },
  { key: 'loan-reconciliation', label: 'Reconciliation' },
  { key: 'loan-repayment-report', label: 'Repayment Report' },
  { key: 'loan-history', label: 'Loan History' },
  { key: 'staff-directory', label: 'Staff Management' },
  { key: 'staff-performance', label: 'Staff Performance' },
  { key: 'npl-status', label: 'NPL Status' },
  { key: 'reports', label: 'Reports' },
  { key: 'feedback-support', label: 'Feedback & Support' },
] as const;

interface UserProfile {
  user_id: string;
  email: string;
  surname: string;
  first_name: string;
  state: string;
  staff_id_no: string;
}

export default function ModuleAccessTab() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [accessMap, setAccessMap] = useState<Record<string, Set<string>>>({});
  const [rolesMap, setRolesMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [profilesRes, accessRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('user_id, email, surname, first_name, state, staff_id_no'),
      supabase.from('user_module_access').select('user_id, module_key'),
      supabase.from('user_roles').select('user_id, role'),
    ]);

    if (profilesRes.data) setProfiles(profilesRes.data);

    const map: Record<string, Set<string>> = {};
    accessRes.data?.forEach((row: any) => {
      if (!map[row.user_id]) map[row.user_id] = new Set();
      map[row.user_id].add(row.module_key);
    });
    setAccessMap(map);

    const rMap: Record<string, string[]> = {};
    rolesRes.data?.forEach((row: any) => {
      if (!rMap[row.user_id]) rMap[row.user_id] = [];
      rMap[row.user_id].push(row.role);
    });
    setRolesMap(rMap);

    setLoading(false);
  };

  const toggleModule = (userId: string, moduleKey: string) => {
    setAccessMap((prev) => {
      const next = { ...prev };
      const userSet = new Set(next[userId] || []);
      if (userSet.has(moduleKey)) {
        userSet.delete(moduleKey);
      } else {
        userSet.add(moduleKey);
      }
      next[userId] = userSet;
      return next;
    });
  };

  const toggleAll = (userId: string) => {
    setAccessMap((prev) => {
      const next = { ...prev };
      const userSet = new Set(next[userId] || []);
      const allSelected = MODULE_KEYS.every((m) => userSet.has(m.key));
      if (allSelected) {
        next[userId] = new Set();
      } else {
        next[userId] = new Set(MODULE_KEYS.map((m) => m.key));
      }
      return next;
    });
  };

  const saveUserAccess = async (userId: string) => {
    setSaving(userId);
    const modules = accessMap[userId] || new Set();

    // Delete existing access for user
    const { error: delError } = await supabase
      .from('user_module_access')
      .delete()
      .eq('user_id', userId);

    if (delError) {
      toast.error('Failed to update: ' + delError.message);
      setSaving(null);
      return;
    }

    // Insert new access entries
    if (modules.size > 0) {
      const rows = Array.from(modules).map((module_key) => ({
        user_id: userId,
        module_key,
        granted_by: user?.id,
      }));
      const { error: insError } = await supabase.from('user_module_access').insert(rows);
      if (insError) {
        toast.error('Failed to save: ' + insError.message);
        setSaving(null);
        return;
      }
    }

    toast.success('Module access updated successfully');
    setSaving(null);
  };

  const filtered = profiles.filter((p) => {
    const q = search.toLowerCase();
    return !q || p.email?.toLowerCase().includes(q) || p.surname?.toLowerCase().includes(q) || p.first_name?.toLowerCase().includes(q);
  }).sort((a, b) => {
    const aAdmin = (rolesMap[a.user_id] || []).includes('admin') ? 0 : 1;
    const bAdmin = (rolesMap[b.user_id] || []).includes('admin') ? 0 : 1;
    return aAdmin - bAdmin;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Module Access Control</CardTitle>
          <CardDescription>Select which modules each staff member can access. Admins always have full access to all modules.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card z-10 min-w-[180px]">Staff</TableHead>
                  <TableHead className="text-center text-xs whitespace-nowrap px-2 min-w-[100px]">Role</TableHead>
                  {MODULE_KEYS.map((m) => (
                    <TableHead key={m.key} className="text-center text-xs whitespace-nowrap px-2 min-w-[80px]">
                      {m.label}
                    </TableHead>
                  ))}
                  <TableHead className="text-center text-xs px-2">All</TableHead>
                  <TableHead className="text-right">Save</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                     <TableCell colSpan={MODULE_KEYS.length + 4} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                   </TableRow>
                 ) : filtered.length === 0 ? (
                   <TableRow>
                     <TableCell colSpan={MODULE_KEYS.length + 4} className="text-center py-8 text-muted-foreground">No users found</TableCell>
                   </TableRow>
                ) : filtered.map((p) => {
                  const userModules = accessMap[p.user_id] || new Set();
                  const allSelected = MODULE_KEYS.every((m) => userModules.has(m.key));
                  return (
                    <TableRow key={p.user_id}>
                      <TableCell className="sticky left-0 bg-card z-10">
                        <div>
                          <p className="font-medium text-sm">{p.surname} {p.first_name}</p>
                          <p className="text-xs text-muted-foreground">{p.email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center px-2">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {(rolesMap[p.user_id] || []).map((r) => (
                            <Badge key={r} variant={r === 'admin' ? 'destructive' : r === 'loan_officer' ? 'default' : 'secondary'} className="text-xs capitalize">{r.replace('_', ' ')}</Badge>
                          ))}
                          {(!rolesMap[p.user_id] || rolesMap[p.user_id].length === 0) && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      {MODULE_KEYS.map((m) => (
                        <TableCell key={m.key} className="text-center px-2">
                          <Checkbox
                            checked={userModules.has(m.key)}
                            onCheckedChange={() => toggleModule(p.user_id, m.key)}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-center px-2">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={() => toggleAll(p.user_id)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving === p.user_id}
                          onClick={() => saveUserAccess(p.user_id)}
                        >
                          <Save className="w-3 h-3 mr-1" />
                          {saving === p.user_id ? 'Saving...' : 'Save'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
