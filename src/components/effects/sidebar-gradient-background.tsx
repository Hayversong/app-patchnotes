"use client";

import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export function SidebarGradientBackground({ className }: { className?: string }) {
  const reducedMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="absolute inset-0 bg-zinc-950" />
      <motion.div
        className="absolute -left-24 -top-32 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(163,230,53,0.2)_0%,rgba(77,124,15,0.09)_45%,transparent_72%)] blur-2xl will-change-transform"
        animate={reducedMotion ? undefined : { x: [0, 36, 8], y: [0, 58, 20], opacity: [0.68, 0.94, 0.76] }}
        transition={{ duration: 22, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY, repeatType: "mirror" }}
      />
      <motion.div
        className="absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(34,197,94,0.15)_0%,rgba(20,83,45,0.07)_48%,transparent_72%)] blur-2xl will-change-transform"
        animate={reducedMotion ? undefined : { x: [0, -32, -10], y: [0, -52, -18], opacity: [0.56, 0.82, 0.64] }}
        transition={{ duration: 25, delay: 2, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY, repeatType: "mirror" }}
      />
    </div>
  );
}
