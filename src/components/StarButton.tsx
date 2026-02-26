import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface StarButtonProps {
  isStarred: boolean;
  onToggle: (e: React.MouseEvent) => void;
}

export default function StarButton({ isStarred, onToggle }: StarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggle(e); }}
          className={cn(
            'inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors',
            'hover:bg-warning/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isStarred ? 'text-warning' : 'text-muted-foreground/40 hover:text-warning/70'
          )}
          aria-label={isStarred ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          <Star className={cn('w-4 h-4', isStarred && 'fill-current')} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p className="text-xs">{isStarred ? 'Remove from watchlist' : 'Add to watchlist'}</p>
      </TooltipContent>
    </Tooltip>
  );
}
