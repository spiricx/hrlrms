import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  PlusCircle,
  FileText,
  Banknote,
  Package,
  AlertTriangle,
  ArrowLeftRight,
  Menu,
  X,
  LogOut,
  Sun,
  Moon,
  UserCog,
  BarChart3,
  Shield } from
'lucide-react';
import fmbnLogo from '@/assets/fmbn_logo.png';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAccess } from '@/hooks/useModuleAccess';

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') as 'light' | 'dark' || (
      window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggle = () => setTheme((t) => t === 'light' ? 'dark' : 'light');
  return { theme, toggle };
}

const navItems = [
{ path: '/', label: 'Dashboard', icon: LayoutDashboard },
{ path: '/add-beneficiary', label: 'New Loan', icon: PlusCircle },
{ path: '/bulk-upload', label: 'Bulk Loan Creation', icon: Package },
{ path: '/beneficiaries', label: 'Beneficiaries', icon: Users },
{ path: '/bio-data', label: 'Bio Data', icon: FileText },
{ path: '/loan-repayment', label: 'Loan Repayment', icon: Banknote, roles: ['admin', 'loan_officer'] as string[] },
{ path: '/batch-repayment', label: 'Batch Loan Repayment', icon: Package, roles: ['admin', 'loan_officer'] as string[] },
{ path: '/loan-reconciliation', label: 'Reconciliation', icon: ArrowLeftRight, roles: ['admin', 'loan_officer'] as string[] },
{ path: '/loan-history', label: 'Loan History', icon: FileText },
{ path: '/staff-directory', label: 'Staff Management', icon: UserCog, roles: ['admin', 'loan_officer'] as string[] },
{ path: '/staff-performance', label: 'Staff Performance', icon: BarChart3, roles: ['admin', 'loan_officer'] as string[] },
{ path: '/npl-status', label: 'NPL Status', icon: AlertTriangle, roles: ['admin', 'loan_officer'] as string[] },
{ path: '/reports', label: 'Reports', icon: FileText },
{ path: '/admin', label: 'Admin', icon: Shield, roles: ['admin'] as string[] }];


export default function AppLayout({ children }: {children: ReactNode;}) {
  const { user, roles, signOut } = useAuth();
  const { hasModuleAccess } = useModuleAccess();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 gradient-hero flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}>

        <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
          <img src={fmbnLogo} alt="FMBN Logo" className="w-10 h-auto brightness-0 invert" />
          <div>
            <h1 className="text-sm font-bold text-sidebar-foreground font-display">HRLMS Portal</h1>
            <p className="text-[10px] text-sidebar-foreground/60">Loan Processing Unit</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            if (item.roles && !item.roles.some((r) => roles.includes(r as any))) return null;
            // Module access check (skip for admin page which is role-gated)
            const moduleKey = item.path.replace('/', '') || 'dashboard';
            if (moduleKey !== 'admin' && !hasModuleAccess(moduleKey)) return null;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active ?
                  'bg-sidebar-accent text-sidebar-primary' :
                  'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )}>

                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>);

          })}
        </nav>

        <div className="px-4 py-4 border-t border-sidebar-border space-y-2">
          {roles.length > 0 &&
          <p className="text-xs text-sidebar-foreground/60 capitalize">
              Role: {roles.join(', ')}
            </p>
          }
          <p className="text-xs text-sidebar-foreground/40">© FEB 2026 HRL LMS Portal Developed by: SpiricX Dev (Loan Processing Unit) FMBN, Ogun State.
          </p>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && <div
        className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
        onClick={() => setMobileOpen(false)} />

      }

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-4 px-4 py-3 bg-card shadow-card lg:px-8">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-secondary"
            onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-foreground">
              {user?.user_metadata?.surname && user?.user_metadata?.first_name ?
              `${user.user_metadata.surname}, ${user.user_metadata.first_name}` :
              user?.email?.split('@')[0] || 'User'}
            </span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>

              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
            <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
              {(user?.user_metadata?.surname?.[0] || user?.email?.[0] || 'U').toUpperCase()}
            </div>
            <span className="hidden text-sm font-medium sm:block">
              {user?.user_metadata?.surname && user?.user_metadata?.first_name ?
              `Logged in as: ${user.user_metadata.surname}, ${user.user_metadata.first_name}` :
              `Logged in as: ${user?.email?.split('@')[0]}`}
            </span>
            <button
              onClick={signOut}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Sign out">

              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>);

}