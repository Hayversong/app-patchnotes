"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

// Shared variants keep login and register moving with the same rhythm.
export const authStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.055, delayChildren: 0.08 } },
};

export const authItem = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" as const } },
};

export function AuthStagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return <motion.div className={className} variants={reduced ? undefined : authStagger} initial={reduced ? false : "hidden"} animate="visible">{children}</motion.div>;
}

export function AuthItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return <motion.div className={className} variants={reduced ? undefined : authItem}>{children}</motion.div>;
}

export function AuthBrand() {
  const reduced = useReducedMotion();
  return <motion.span
    className="relative inline-block text-lime-400 [text-shadow:0_0_16px_rgb(163_230_53_/_0.16)]"
    initial={reduced ? false : { opacity: 0, y: -8, letterSpacing: "0.34em" }}
    animate={{ opacity: 1, y: 0, letterSpacing: "0.22em" }}
    whileHover={reduced ? undefined : { scale: 1.025, textShadow: "0 0 22px rgb(163 230 53 / 0.38)" }}
    transition={{ duration: reduced ? 0 : 0.45, ease: "easeOut" }}
  >
    PATCHNOTES
    <motion.span aria-hidden="true" className="absolute -bottom-1 left-0 h-px bg-lime-400/70" initial={reduced ? false : { width: 0 }} animate={{ width: "100%" }} transition={{ duration: reduced ? 0 : 0.5, delay: 0.15 }} />
  </motion.span>;
}
