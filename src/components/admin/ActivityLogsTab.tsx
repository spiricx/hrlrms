import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Search, LogIn, LogOut } from 'lucide-react';
import { format } from 'date-fns';

interface ActivityLog {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  action: string;
  state: string;
  bank_branch: string;
  user_agent: string;
  created_at: string;
}

export default function ActivityLogsTab() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [totalLogins, setTotalLogins] = useState(0);
  const [totalLogouts, setTotalLogouts] = useState(0);
  const [activeToday, setActiveToday] = useState(0);

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('staff_activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    const items = (data || []) as ActivityLog[];
    setLogs(items);

    const today = new Date().toISOString().slice(0, 10);
    setTotalLogins(items.filter(l => l.action === 'login').length);
    setTotalLogouts(items.filter(l => l.action === 'logout').length);
    const todayUsers = new Set(items.filter(l => l.created_at.slice(0, 10) === today).map(l => l.user_id));
    setActiveToday(todayUsers.size);
    setLoading(false);
  };

  const filtered = logs.filter((l) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return l.email?.toLowerCase().includes(q) || l.full_name?.toLowerCase().includes(q) || l.state?.toLowerCase().includes(q) || l.bank_branch?.toLowerCase().includes(q);
  });

  const getBrowserInfo = (ua: string) => {
    if (!ua) return '—';
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Edg')) return 'Edge';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    return 'Other';
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Today</CardDescription>
            <CardTitle className="text-3xl text-primary">{loading ? '...' : activeToday}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Logins (Recent)</CardDescription>
            <CardTitle className="text-3xl">{loading ? '...' : totalLogins}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Logouts (Recent)</CardDescription>
            <CardTitle className="text-3xl">{loading ? '...' : totalLogouts}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by name, email, state, branch..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Staff Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Browser</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No activity logs found</TableCell></TableRow>
                ) : filtered.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(log.created_at), 'dd MMM yyyy HH:mm:ss')}</TableCell>
                    <TableCell>
                      <Badge variant={log.action === 'login' ? 'default' : 'destructive'} className="text-xs capitalize gap-1">
                        {log.action === 'login' ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{log.full_name || '—'}</TableCell>
                    <TableCell className="text-sm">{log.email}</TableCell>
                    <TableCell className="text-sm">{log.state || '—'}</TableCell>
                    <TableCell className="text-sm">{log.bank_branch || '—'}</TableCell>
                    <TableCell className="text-xs">{getBrowserInfo(log.user_agent)}</TableCell>
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
