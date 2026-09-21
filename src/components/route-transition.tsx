"use client";

import { motion, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";

export function RouteTransition({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [hasError, setHasError] = useState(false);
  // Error announcements must never wait for a page transition.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const check = () => setHasError(Boolean(root.querySelector('[role="alert"]')));
    check();
    const observer = new MutationObserver(check);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["role"] });
    return () => observer.disconnect();
  }, []);
  return <motion.div ref={ref} initial={reduced || hasError ? false : { opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: reduced || hasError ? 0 : 0.2, ease: "easeOut" }} className="will-change-[opacity,transform]">
    {children}
  </motion.div>;
}
