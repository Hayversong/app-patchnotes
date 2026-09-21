import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Feedback({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <p role={error ? "alert" : "status"} className={cn("text-sm leading-6", error ? "text-red-400" : "text-lime-400")}>{children}</p>;
}
export function LoadingState({ label }: { label: string }) {
  return <div role="status" aria-busy="true" className="space-y-4 py-6">
    <p className="flex items-center gap-2 text-sm text-zinc-400"><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />{label}</p>
    <div aria-hidden="true" className="space-y-3 motion-safe:animate-pulse"><div className="h-4 w-1/3 rounded bg-zinc-800" /><div className="h-24 rounded-xl bg-zinc-900" /></div>
  </div>;
}
export function ErrorState({ message, retry, pending = false }: { message: string; retry: () => void; pending?: boolean }) {
  return <div className="space-y-3 rounded-xl border border-zinc-800 p-6"><Feedback error>{message}</Feedback><p className="text-sm text-muted-foreground">Verifique sua conexão e tente novamente.</p><Button variant="outline" onClick={retry} loading={pending} loadingText="Tentando novamente...">Tentar novamente</Button></div>;
}
export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center"><h2 className="text-base font-medium">{title}</h2><div className="mt-2 text-sm leading-6 text-muted-foreground">{children}</div></div>;
}
