"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function SidebarLabel({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  return <motion.span aria-hidden={collapsed} className="block min-w-0 overflow-hidden whitespace-nowrap"
    initial={false} animate={{ width: collapsed ? 0 : "auto", opacity: collapsed ? 0 : 1 }}
    transition={reduced ? { duration: 0 } : { width: { type: "spring", stiffness: 260, damping: 32 }, opacity: { duration: 0.1, delay: collapsed ? 0 : 0.08 } }}>
    <span className="block pl-3">{children}</span>
  </motion.span>;
}
