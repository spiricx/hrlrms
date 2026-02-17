import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Star, MessageSquare, AlertCircle, HelpCircle, Eye, Send } from 'lucide-react';
import { format } from 'date-fns';

type Category = 'staff_review' | 'comment_suggestion' | 'report_issue' | 'request_assistance';
type Priority = 'low' | 'medium' | 'high' | 'urgent';
type Status = 'open' | 'in_progress' | 'resolved' | 'closed';

interface Submission {
  id: string;
  user_id: string;
  category: Category;
  subject: string;
  message: string;
  priority: Priority;
  status: Status;
  admin_response: string | null;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  submitter_name: string;
  submitter_state: string;
  submitter_branch: string;
}

const CATEGORY_CONFIG: Record<Category, { label: string; icon: typeof Star; description: string }> = {
  staff_review: { label: 'Staff Review', icon: Star, description: 'Submit a performance or conduct review' },
  comment_suggestion: { label: 'Comments & Suggestions', icon: MessageSquare, description: 'Share your comments or suggestions for improvement' },
  report_issue: { label: 'Report an Issue', icon: AlertCircle, description: 'Report a system or operational issue' },
  request_assistance: { label: 'Request Assistance', icon: HelpCircle, description: 'Request help or support' },
};

const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-primary/10 text-primary',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  urgent: 'bg-destructive/10 text-destructive',
};

const STATUS_COLORS: Record<Status, string> = {
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-muted text-muted-foreground',
};

export default function FeedbackSupport() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes('admin');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Category>('staff_review');
  const [showForm, setShowForm] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);

  // Form state
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [submitting, setSubmitting] = useState(false);

  // Admin response state
  const [adminResponse, setAdminResponse] = useState('');
  const [statusUpdate, setStatusUpdate] = useState<Status>('open');
  const [responding, setResponding] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);

  const handleRate = async (submissionId: string, rating: number) => {
    const { error } = await supabase
      .from('feedback_submissions')
      .update({ rating })
      .eq('id', submissionId);
    if (error) {
      toast.error('Failed to save rating');
    } else {
      toast.success('Rating saved!');
      fetchSubmissions();
    }
  };

  useEffect(() => { fetchSubmissions(); }, [activeTab]);

  const fetchSubmissions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('feedback_submissions')
      .select('*')
      .eq('category', activeTab)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load submissions');
    } else {
      setSubmissions((data as Submission[]) || []);
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Please fill in subject and message');
      return;
    }
    setSubmitting(true);

    // Fetch submitter profile info
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, state, bank_branch')
      .eq('user_id', user!.id)
      .single();

    const { error } = await supabase.from('feedback_submissions').insert({
      user_id: user!.id,
      category: activeTab,
      subject: subject.trim(),
      message: message.trim(),
      priority,
      submitter_name: profile?.full_name || '',
      submitter_state: profile?.state || '',
      submitter_branch: profile?.bank_branch || '',
    });
    if (error) {
      toast.error('Failed to submit: ' + error.message);
    } else {
      toast.success('Submitted successfully');
      setSubject('');
      setMessage('');
      setPriority('medium');
      setShowForm(false);
      fetchSubmissions();
    }
    setSubmitting(false);
  };

  const handleRespond = async () => {
    if (!selectedSubmission) return;
    setResponding(true);
    const { error } = await supabase
      .from('feedback_submissions')
      .update({
        admin_response: adminResponse.trim() || null,
        status: statusUpdate,
        responded_by: user!.id,
        responded_at: new Date().toISOString(),
      })
      .eq('id', selectedSubmission.id);
    if (error) {
      toast.error('Failed to respond: ' + error.message);
    } else {
      toast.success('Response saved');
      setSelectedSubmission(null);
      setAdminResponse('');
      fetchSubmissions();
    }
    setResponding(false);
  };

  const config = CATEGORY_CONFIG[activeTab];
  const Icon = config.icon;
  const filtered = submissions;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-display">Feedback & Support</h1>
          <p className="text-sm text-muted-foreground">Submit reviews, suggestions, issues, and assistance requests</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Category)}>
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
          <TabsTrigger value="staff_review" className="gap-1.5 text-xs sm:text-sm">
            <Star className="w-3.5 h-3.5" /> Staff Review
          </TabsTrigger>
          <TabsTrigger value="comment_suggestion" className="gap-1.5 text-xs sm:text-sm">
            <MessageSquare className="w-3.5 h-3.5" /> Comments
          </TabsTrigger>
          <TabsTrigger value="report_issue" className="gap-1.5 text-xs sm:text-sm">
            <AlertCircle className="w-3.5 h-3.5" /> Report Issue
          </TabsTrigger>
          <TabsTrigger value="request_assistance" className="gap-1.5 text-xs sm:text-sm">
            <HelpCircle className="w-3.5 h-3.5" /> Assistance
          </TabsTrigger>
        </TabsList>

        {(['staff_review', 'comment_suggestion', 'report_issue', 'request_assistance'] as Category[]).map((cat) => (
          <TabsContent key={cat} value={cat} className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold">{CATEGORY_CONFIG[cat].label}</h2>
                  <p className="text-xs text-muted-foreground">{CATEGORY_CONFIG[cat].description}</p>
                </div>
              </div>
              <Button size="sm" onClick={() => setShowForm(!showForm)}>
                <Plus className="w-4 h-4 mr-1" /> New Submission
              </Button>
            </div>

            {/* Submission Form */}
            {showForm && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">New {CATEGORY_CONFIG[cat].label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Subject</Label>
                      <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief subject..." />
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Message</Label>
                    <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe in detail..." rows={4} />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                    <Button size="sm" disabled={submitting} onClick={handleSubmit}>
                      <Send className="w-4 h-4 mr-1" /> {submitting ? 'Submitting...' : 'Submit'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Submissions Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subject</TableHead>
                        {isAdmin && <TableHead>Submitted By</TableHead>}
                        {isAdmin && <TableHead>State</TableHead>}
                        {isAdmin && <TableHead>Branch</TableHead>}
                        <TableHead className="text-center">Priority</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                         <TableCell colSpan={isAdmin ? 8 : 5} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                        </TableRow>
                      ) : filtered.length === 0 ? (
                        <TableRow>
                           <TableCell colSpan={isAdmin ? 8 : 5} className="text-center py-8 text-muted-foreground">No submissions yet</TableCell>
                        </TableRow>
                      ) : filtered.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium max-w-[200px] truncate">{s.subject}</TableCell>
                          {isAdmin && <TableCell className="text-sm">{s.submitter_name || '—'}</TableCell>}
                          {isAdmin && <TableCell className="text-sm">{s.submitter_state || '—'}</TableCell>}
                          {isAdmin && <TableCell className="text-sm">{s.submitter_branch || '—'}</TableCell>}
                          <TableCell className="text-center">
                            <Badge variant="outline" className={PRIORITY_COLORS[s.priority]}>{s.priority}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={STATUS_COLORS[s.status]}>{s.status.replace('_', ' ')}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {format(new Date(s.created_at), 'dd MMM yyyy')}
                          </TableCell>
                          <TableCell className="text-right">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => {
                                  setSelectedSubmission(s);
                                  setAdminResponse(s.admin_response || '');
                                  setStatusUpdate(s.status);
                                }}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-lg">
                                <DialogHeader>
                                  <DialogTitle>{s.subject}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div className="flex gap-2">
                                    <Badge variant="outline" className={PRIORITY_COLORS[s.priority]}>{s.priority}</Badge>
                                    <Badge variant="outline" className={STATUS_COLORS[s.status]}>{s.status.replace('_', ' ')}</Badge>
                                  </div>
                                  {isAdmin && (
                                    <div className="grid grid-cols-3 gap-3">
                                      <div>
                                        <Label className="text-xs text-muted-foreground">Full Name</Label>
                                        <p className="text-sm font-medium">{s.submitter_name || '—'}</p>
                                      </div>
                                      <div>
                                        <Label className="text-xs text-muted-foreground">State</Label>
                                        <p className="text-sm">{s.submitter_state || '—'}</p>
                                      </div>
                                      <div>
                                        <Label className="text-xs text-muted-foreground">Branch</Label>
                                        <p className="text-sm">{s.submitter_branch || '—'}</p>
                                      </div>
                                    </div>
                                  )}
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Submitted on</Label>
                                    <p className="text-sm">{format(new Date(s.created_at), 'dd MMM yyyy, h:mm a')}</p>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Message</Label>
                                    <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">{s.message}</p>
                                  </div>
                                    {s.admin_response && (
                                      <div>
                                        <Label className="text-xs text-muted-foreground">Admin Response</Label>
                                        <p className="text-sm whitespace-pre-wrap bg-primary/5 p-3 rounded-lg border border-primary/10">{s.admin_response}</p>
                                        {s.responded_at && (
                                          <p className="text-xs text-muted-foreground mt-1">Responded: {format(new Date(s.responded_at), 'dd MMM yyyy, h:mm a')}</p>
                                        )}
                                      </div>
                                    )}
                                    {/* Star Rating - visible to the submitter when admin has responded */}
                                    {s.admin_response && !isAdmin && (
                                      <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Rate the Feedback & Support team</Label>
                                        <div className="flex gap-1">
                                          {[1, 2, 3, 4, 5].map((star) => (
                                            <button
                                              key={star}
                                              type="button"
                                              className="focus:outline-none transition-colors"
                                              onMouseEnter={() => setHoverRating(star)}
                                              onMouseLeave={() => setHoverRating(0)}
                                              onClick={() => handleRate(s.id, star)}
                                            >
                                              <Star
                                                className={`w-6 h-6 ${
                                                  (hoverRating || (s as any).rating || 0) >= star
                                                    ? 'fill-yellow-400 text-yellow-400'
                                                    : 'text-muted-foreground/40'
                                                }`}
                                              />
                                            </button>
                                          ))}
                                        </div>
                                        {(s as any).rating && (
                                          <p className="text-xs text-muted-foreground">You rated: {(s as any).rating}/5</p>
                                        )}
                                      </div>
                                    )}
                                    {/* Show rating to admin */}
                                    {isAdmin && (s as any).rating && (
                                      <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Support Team Rating</Label>
                                        <div className="flex gap-1">
                                          {[1, 2, 3, 4, 5].map((star) => (
                                            <Star
                                              key={star}
                                              className={`w-5 h-5 ${
                                                (s as any).rating >= star
                                                  ? 'fill-yellow-400 text-yellow-400'
                                                  : 'text-muted-foreground/40'
                                              }`}
                                            />
                                          ))}
                                        </div>
                                        <p className="text-xs text-muted-foreground">Rated: {(s as any).rating}/5</p>
                                      </div>
                                    )}
                                  {isAdmin && (
                                    <div className="space-y-3 border-t pt-3">
                                      <Label className="font-semibold">Admin Response</Label>
                                      <Select value={statusUpdate} onValueChange={(v) => setStatusUpdate(v as Status)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="open">Open</SelectItem>
                                          <SelectItem value="in_progress">In Progress</SelectItem>
                                          <SelectItem value="resolved">Resolved</SelectItem>
                                          <SelectItem value="closed">Closed</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Textarea value={adminResponse} onChange={(e) => setAdminResponse(e.target.value)} placeholder="Type your response..." rows={3} />
                                      <Button size="sm" disabled={responding} onClick={handleRespond}>
                                        {responding ? 'Saving...' : 'Save Response'}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
