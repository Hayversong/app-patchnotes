import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

export function AuthShell({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description: string;
  footer: { text: string; label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 block font-mono text-sm font-semibold tracking-[0.22em] text-lime-400">
          PATCHNOTES
        </Link>
        <Card className="shadow-2xl shadow-black/30">
          <CardHeader>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        <p className="mt-5 text-center text-sm text-zinc-400">
          {footer.text}{" "}
          <Link className="font-medium text-lime-400 hover:text-lime-300" href={footer.href}>
            {footer.label}
          </Link>
        </p>
      </div>
    </main>
  );
}
