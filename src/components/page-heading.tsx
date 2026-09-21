import { Sparkles } from "@/components/effects/sparkles";

export function PageHeading({ eyebrow, title, description, aside }: { eyebrow: string; title: string; description?: string; aside?: React.ReactNode }) {
  return (
    <section className="relative isolate overflow-hidden rounded-xl px-1 py-2" aria-label={eyebrow}>
      <Sparkles className="absolute inset-0 opacity-55 [mask-image:linear-gradient(to_right,black,black_72%,transparent)]" particleDensity={54} minSize={0.45} maxSize={1.45} speed={0.72} />
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
        <div className="hud-heading relative min-w-0 pl-5">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-lime-400">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
        </div>
        {aside}
      </div>
    </section>
  );
}
