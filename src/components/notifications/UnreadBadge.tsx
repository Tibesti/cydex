import { cn } from '@/lib/utils';

// Unread notification count, capped at "9+". Renders nothing at zero.
const UnreadBadge = ({ count, className }: { count: number; className?: string }) => {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none text-black',
        className,
      )}
      aria-label={`${count} unread notifications`}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
};

export default UnreadBadge;
