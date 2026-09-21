"use client";

import { motion, useReducedMotion } from "motion/react";

export function LogoBrand() {
  const reduced = useReducedMotion();

  return (
    <motion.span
      className="relative inline-flex text-base font-bold tracking-[0.2em] text-lime-400 [text-shadow:0_0_18px_rgb(163_230_53_/_0.18)] sm:text-lg"
      initial={reduced ? false : { opacity: 0, y: -7, letterSpacing: "0.3em" }}
      animate={{ opacity: 1, y: 0, letterSpacing: "0.2em" }}
      whileHover={reduced ? undefined : { y: -1, textShadow: "0 0 22px rgb(163 230 53 / 0.38)" }}
      transition={{ duration: reduced ? 0 : 0.42, ease: "easeOut" }}
    >
      PATCHNOTES
      <motion.span
        aria-hidden="true"
        className="absolute -bottom-1 left-0 h-px w-full bg-lime-400/70"
        initial={reduced ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: reduced ? 0 : 0.45, delay: reduced ? 0 : 0.14, ease: "easeOut" }}
        style={{ originX: 0 }}
      />
    </motion.span>
  );
}
