export function PageHeading({ eyebrow, title, description, aside }: { eyebrow: string; title: string; description?: string; aside?: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-5"><div className="hud-heading relative min-w-0 pl-5"><p className="font-mono text-xs uppercase tracking-[0.2em] text-lime-400">{eyebrow}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}</div>{aside}</div>;
}
