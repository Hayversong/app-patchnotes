"use client";

// Adapted from motion-primitives TextShimmer (MIT).
// https://motion-primitives.com/docs/text-shimmer
import { motion, useReducedMotion } from "motion/react";

export function TextShimmer({ children }: { children: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <span>{children}</span>;
  return <motion.span
    className="inline-block bg-clip-text text-transparent"
    style={{
      backgroundImage: "linear-gradient(110deg, var(--muted-foreground) 35%, var(--primary) 50%, var(--muted-foreground) 65%)",
      backgroundSize: "250% 100%",
    }}
    initial={{ backgroundPosition: "100% center" }}
    animate={{ backgroundPosition: "0% center" }}
    transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}>
    {children}
  </motion.span>;
}
