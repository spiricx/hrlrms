import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import fmbnLogo from '@/assets/fmbn_logo.png';
import fmbnHero from '@/assets/fmbn_hero.jpeg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export default function Auth() {
  const { user, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      if (error) throw error;
      const surname = data.user?.user_metadata?.surname || data.user?.email?.split('@')[0] || 'User';
      toast({ title: `Welcome back, ${surname}!`, description: 'You have signed in successfully.' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
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
              <h1 className="text-lg font-bold font-display">HRL RMS Portal</h1>
              <p className="text-[10px] text-muted-foreground">Loan Processing Unit</p>
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-bold font-display">Sign In</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your credentials to access the portal
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                  required
                />
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
                  minLength={6}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full gradient-accent text-accent-foreground border-0 font-semibold"
            >
              {submitting ? 'Please wait...' : 'Sign In'}
            </Button>

            <button
              type="button"
              onClick={async () => {
                if (!form.email) {
                  toast({ title: 'Enter your email', description: 'Please enter your email address first.', variant: 'destructive' });
                  return;
                }
                try {
                  const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
                    redirectTo: `${window.location.origin}/reset-password`,
                  });
                  if (error) throw error;
                  toast({ title: 'Check your email', description: 'A password reset link has been sent to your email.' });
                } catch (err: any) {
                  toast({ title: 'Error', description: err.message, variant: 'destructive' });
                }
              }}
              className="w-full text-center text-sm text-accent hover:underline"
            >
              Forgot Password?
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Staff accounts are created by your administrator via the Staff Directory.
            Contact your admin if you need access.
          </p>
        </div>
      </div>
    </div>
  );
}
