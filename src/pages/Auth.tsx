import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Mail, Lock, User, Hash, MapPin } from 'lucide-react';
import fmbnLogo from '@/assets/fmbn_logo.png';
import fmbnHero from '@/assets/fmbn_hero.jpeg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { NIGERIA_STATES } from '@/lib/nigeriaStates';

export default function Auth() {
  const { user, loading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    surname: '',
    firstName: '',
    otherNames: '',
    staffIdNo: '',
    nhfAccountNumber: '',
    bankBranch: '',
    state: ''
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>);

  }

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password
        });
        if (error) throw error;
        const surname = data.user?.user_metadata?.surname || data.user?.email?.split('@')[0] || 'User';
        toast({ title: `Welcome back, ${surname}!`, description: 'You have signed in successfully.' });
      } else {
        if (!form.surname || !form.firstName || !form.staffIdNo || !form.state || !form.bankBranch) {
          toast({ title: 'Validation Error', description: 'Please fill all required fields.', variant: 'destructive' });
          setSubmitting(false);
          return;
        }
        const fullName = [form.surname, form.firstName, form.otherNames].filter(Boolean).join(' ');
        const { error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: {
              full_name: fullName,
              surname: form.surname,
              first_name: form.firstName,
              other_names: form.otherNames,
              staff_id_no: form.staffIdNo,
              nhf_account_number: form.nhfAccountNumber,
              bank_branch: form.bankBranch,
              state: form.state
            },
            emailRedirectTo: window.location.origin
          }
        });
        if (error) throw error;
        toast({
          title: 'Account created!',
          description: 'Please check your email to verify your account.'
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const set = (key: string, value: string) => setForm({ ...form, [key]: value });

  return (
    <div className="min-h-screen flex">
      {/* Left side - branding */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-12 overflow-hidden">
        <img src={fmbnHero} alt="FMBN professionals at work" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 gradient-hero opacity-80" />
        <div className="relative z-10 max-w-md text-center">
          <img src={fmbnLogo} alt="FMBN Logo" className="w-28 h-auto mx-auto mb-6 drop-shadow-lg" />
          <p className="text-xs font-semibold tracking-widest uppercase text-sidebar-foreground/60 mb-1">Loan Processing Unit</p>
          <h1 className="text-3xl font-bold font-display text-sidebar-foreground drop-shadow-md">HRL-RMS Portal</h1>
          <p className="mt-2 text-sm text-sidebar-foreground/80 drop-shadow-sm">Home Renovation Loan Repayment Management System</p>
          <p className="mt-3 text-sidebar-foreground/60 text-xs">Create Loans · Update Loan Repayment Records · Track Loan Monthly Repayments</p>
        </div>
      </div>

      {/* Right side - form */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
            <img src={fmbnLogo} alt="FMBN Logo" className="w-12 h-auto" />
            <div>
              <h1 className="text-lg font-bold font-display">HRLMS Portal</h1>
              <p className="text-[10px] text-muted-foreground">Loan Processing Unit</p>
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-bold font-display">
              {isLogin ? 'Sign In' : 'Create Account'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLogin ?
              'Enter your credentials to access the portal' :
              'Register to get started — first user gets admin access'}
            </p>
            {!isLogin && (
              <p className="mt-2 text-xs text-accent bg-accent/10 rounded-md px-3 py-2">
                Staff: Use the same email address your admin registered in the Staff Directory to automatically link your account.
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin &&
            <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="surname">Surname *</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="surname" placeholder="e.g. Ogundimu" value={form.surname} onChange={(e) => set('surname', e.target.value)} className="pl-10" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input id="firstName" placeholder="e.g. Adebayo" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="otherNames">Other Names</Label>
                  <Input id="otherNames" placeholder="e.g. Oluwafemi" value={form.otherNames} onChange={(e) => set('otherNames', e.target.value)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="staffIdNo">Staff ID No. *</Label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="staffIdNo" placeholder="e.g. EMP-1024" value={form.staffIdNo} onChange={(e) => set('staffIdNo', e.target.value)} className="pl-10" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nhfAccount">NHF Account No.</Label>
                    <Input id="nhfAccount" placeholder="e.g. NHF123456" value={form.nhfAccountNumber} onChange={(e) => set('nhfAccountNumber', e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>State *</Label>
                    <Select value={form.state} onValueChange={(v) => set('state', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {NIGERIA_STATES.map((s) =>
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                      )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bankBranch">Bank Branch *</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="bankBranch" placeholder="e.g. Ikeja Branch" value={form.bankBranch} onChange={(e) => set('bankBranch', e.target.value)} className="pl-10" required />
                    </div>
                  </div>
                </div>
              </>
            }

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  className="pl-10"
                  required />

              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  className="pl-10"
                  required
                  minLength={6} />

              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full gradient-accent text-accent-foreground border-0 font-semibold">

              {submitting ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="font-medium text-accent hover:underline">

              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    </div>);

}