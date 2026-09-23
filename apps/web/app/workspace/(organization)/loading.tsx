import { Skeleton } from "@/components/ui/skeleton";
export default function LoadingWorkspace() {
  return <div role="status" aria-label="Loading workspace" className="space-y-6"><Skeleton className="h-8 w-40" /><Skeleton className="h-48 w-full" /><Skeleton className="h-64 w-full" /></div>;
}
