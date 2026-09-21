"use client";

// Adapted from motion-primitives TransitionPanel (MIT).
// https://motion-primitives.com/docs/transition-panel
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function TransitionPanel({ children, activeIndex, className }: {
  children: ReactNode[]; activeIndex: number; className?: string;
}) {
  const reduced = useReducedMotion();
  return <div className={className}>
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div key={activeIndex} initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: reduced ? 0 : 0.1 }}>
        {children[activeIndex]}
      </motion.div>
    </AnimatePresence>
  </div>;
}
