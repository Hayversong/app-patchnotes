"use client";

// Adapted from motion-primitives AnimatedGroup (MIT).
// Stable keys preserve mounted entries when a new devlog is prepended.
// https://motion-primitives.com/docs/animated-group
import { Children, isValidElement, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

export function AnimatedGroup({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return <div className={className}>
    {Children.toArray(children).map((child, index) => (
      <motion.div key={isValidElement(child) ? child.key ?? index : index}
        className="min-w-0 [&>[data-slot=card]]:h-full"
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0, delay: 0 } : { type: "spring", stiffness: 240, damping: 28, delay: Math.min(index, 5) * 0.04 }}>
        {child}
      </motion.div>
    ))}
  </div>;
}
