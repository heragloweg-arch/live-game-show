import { cn } from '../../utils/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl bg-white/10',
        className
      )}
    />
  );
}

export function MatchSkeleton() {
  return (
    <div className="flex min-h-screen flex-col gap-4 p-5">
      <div className="flex justify-between">
        <Skeleton className="h-12 w-24" />
        <Skeleton className="h-12 w-24" />
      </div>
      <Skeleton className="mx-auto h-8 w-32" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
