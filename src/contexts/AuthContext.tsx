import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'loan_officer' | 'staff';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  hasRole: (role: AppRole) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function logActivity(user: User, action: 'login' | 'logout') {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, state, bank_branch')
      .eq('user_id', user.id)
      .single();

    await supabase.from('staff_activity_logs').insert({
      user_id: user.id,
      email: user.email || '',
      full_name: profile?.full_name || user.user_metadata?.full_name || '',
      action,
      state: profile?.state || '',
      bank_branch: profile?.bank_branch || '',
      user_agent: navigator.userAgent || '',
    });
  } catch (e) {
    console.error('Failed to log activity:', e);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const hasLoggedLogin = useRef(false);

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    if (data) {
      setRoles(data.map((r: any) => r.role as AppRole));
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchRoles(session.user.id), 0);
          // Log login on SIGNED_IN event (not on TOKEN_REFRESHED)
          if (event === 'SIGNED_IN' && !hasLoggedLogin.current) {
            hasLoggedLogin.current = true;
            setTimeout(() => logActivity(session.user, 'login'), 100);
          }
        } else {
          setRoles([]);
          hasLoggedLogin.current = false;
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRoles(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const hasRole = (role: AppRole) => roles.includes(role);

  const signOut = async () => {
    // Log logout before signing out
    if (user) {
      await logActivity(user, 'logout');
    }
    await supabase.auth.signOut();
    setRoles([]);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, roles, hasRole, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
