import { Skeleton } from "@/components/common/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="flex items-end justify-between">
        <div>
          <Skeleton className="h-7 w-24" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i}>
            <Skeleton className="h-24 w-full rounded-xl" />
          </li>
        ))}
      </ul>
    </main>
  );
}
