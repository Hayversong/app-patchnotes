"use client";

import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { motion, useReducedMotion } from "motion/react";
import { AnimatedBackground } from "./animated-background";
import { AuthItem, AuthStagger } from "./auth-motion";
import { LogoBrand } from "./logo-brand";

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
  const reduced = useReducedMotion();
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <AnimatedBackground />
      <div className="relative z-10 w-full max-w-md">
        <Link href="/" className="mb-8 block w-fit font-mono text-sm font-semibold">
          <LogoBrand />
        </Link>
        <motion.div initial={reduced ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 25 }} className="will-change-[opacity,transform]">
          <Card className="border-white/10 bg-card/95 shadow-2xl shadow-black/50">
            <AuthStagger>
              <CardHeader><AuthItem><h1 className="text-2xl font-semibold tracking-tight">{title}</h1></AuthItem><AuthItem><CardDescription>{description}</CardDescription></AuthItem></CardHeader>
              <CardContent>{children}</CardContent>
            </AuthStagger>
          </Card>
        </motion.div>
        <motion.p initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.2, delay: reduced ? 0 : 0.24 }} className="mt-5 text-center text-sm text-zinc-400">
          {footer.text}{" "}
          <Link className="font-medium text-lime-400 hover:text-lime-300" href={footer.href}>
            {footer.label}
          </Link>
        </motion.p>
      </div>
    </main>
  );
}
