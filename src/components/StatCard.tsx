import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  trend?: string;
  variant?: 'default' | 'accent' | 'success' | 'destructive';
}

const variantStyles = {
  default: 'bg-card',
  accent: 'gradient-accent text-accent-foreground',
  success: 'bg-success text-success-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
};

export default function StatCard({ label, value, icon, trend, variant = 'default' }: StatCardProps) {
  const isColored = variant !== 'default';

  return (
    <div className={cn('rounded-xl p-5 shadow-card transition-shadow hover:shadow-elevated', variantStyles[variant])}>
      <div className="flex items-start justify-between">
        <div>
          <p className={cn('text-xs font-medium uppercase tracking-wider', isColored ? 'opacity-80' : 'text-muted-foreground')}>
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold font-display">{value}</p>
          {trend && (
            <p className={cn('mt-1 text-xs font-medium', isColored ? 'opacity-70' : 'text-muted-foreground')}>
              {trend}
            </p>
          )}
        </div>
        <div className={cn('p-2 rounded-lg', isColored ? 'bg-white/20' : 'bg-secondary')}>
          {icon}
        </div>
      </div>
    </div>
  );
}
