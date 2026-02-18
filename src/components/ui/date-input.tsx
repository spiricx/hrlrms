/**
 * DateInput — a stable, non-jumping date picker for use inside dialogs.
 *
 * Shows a "dd MMM yyyy" formatted display label; clicking it opens the
 * browser-native date picker which never repositions or shifts the dialog.
 *
 * Usage:
 *   <DateInput value={date} onChange={setDate} max={new Date()} />
 */
import * as React from 'react';
import { format, isValid } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DateInputProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  /** Maximum selectable date (defaults to no limit) */
  max?: Date;
  /** Minimum selectable date */
  min?: Date;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DateInput({
  value,
  onChange,
  max,
  min,
  placeholder = 'Select date',
  className,
  disabled = false,
}: DateInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const displayValue = value && isValid(value)
    ? format(value, 'dd MMM yyyy')
    : null;

  const nativeValue = value && isValid(value)
    ? format(value, 'yyyy-MM-dd')
    : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (!raw) {
      onChange(undefined);
      return;
    }
    // Parse yyyy-MM-dd without timezone shift
    const [y, m, d] = raw.split('-').map(Number);
    const parsed = new Date(y, m - 1, d);
    onChange(isValid(parsed) ? parsed : undefined);
  };

  return (
    <div className={cn('relative w-full', className)}>
      {/* Visible styled display */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.showPicker?.()}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !displayValue && 'text-muted-foreground',
        )}
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-left">
          {displayValue ?? placeholder}
        </span>
      </button>

      {/* Hidden native input — positioned over the button so its picker opens in-place */}
      <input
        ref={inputRef}
        type="date"
        value={nativeValue}
        onChange={handleChange}
        max={max ? format(max, 'yyyy-MM-dd') : undefined}
        min={min ? format(min, 'yyyy-MM-dd') : undefined}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
