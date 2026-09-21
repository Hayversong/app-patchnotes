"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";

export function AuthRouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const direction = pathname === "/register" ? 1 : -1;

  return <AnimatePresence mode="wait" initial={false}>
    <motion.div key={pathname} className="min-h-screen will-change-[opacity,transform]" initial={reduced ? false : { opacity: 0, x: direction * 16 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? { opacity: 1 } : { opacity: 0, x: direction * -12 }} transition={{ duration: reduced ? 0 : 0.2, ease: "easeOut" }}>
      {children}
    </motion.div>
  </AnimatePresence>;
}
