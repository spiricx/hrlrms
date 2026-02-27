import { Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface FlagButtonProps {
  isFlagged: boolean;
  onToggle: (e: React.MouseEvent) => void;
}

export default function FlagButton({ isFlagged, onToggle }: FlagButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggle(e); }}
          className={cn(
            'inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors',
            'hover:bg-destructive/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isFlagged ? 'text-destructive' : 'text-muted-foreground/40 hover:text-destructive/70'
          )}
          aria-label={isFlagged ? 'Remove red flag' : 'Red flag this beneficiary'}
        >
          <Flag className={cn('w-4 h-4', isFlagged && 'fill-current')} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p className="text-xs">{isFlagged ? 'Remove red flag' : 'Red flag for watch'}</p>
      </TooltipContent>
    </Tooltip>
  );
}
