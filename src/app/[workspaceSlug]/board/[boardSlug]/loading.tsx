import { Skeleton } from "@/components/common/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-border/60 flex h-12 items-center gap-3 border-b px-4">
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="flex flex-1 gap-3 overflow-x-auto px-4 pt-3 pb-6">
        {Array.from({ length: 4 }).map((_, c) => (
          <div
            key={c}
            className="bg-muted/40 flex w-72 shrink-0 flex-col gap-2 rounded-xl p-2"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
