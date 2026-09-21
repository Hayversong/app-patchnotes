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
