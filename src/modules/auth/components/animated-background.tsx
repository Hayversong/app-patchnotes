"use client";

import { motion, useReducedMotion } from "motion/react";

const ambientTransition = {
  duration: 24,
  ease: "easeInOut" as const,
  repeat: Number.POSITIVE_INFINITY,
  repeatType: "mirror" as const,
};

export function AnimatedBackground() {
  const reduced = useReducedMotion();

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden bg-[#050806]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#050806_0%,#0a160e_48%,#06110d_100%)]" />

      <motion.div
        className="absolute -left-[24rem] -top-[30rem] h-[72rem] w-[72rem] rounded-full bg-[radial-gradient(circle,rgba(190,242,100,0.52)_0%,rgba(132,204,22,0.28)_28%,rgba(77,124,15,0.1)_52%,transparent_72%)] mix-blend-screen will-change-transform"
        animate={reduced ? undefined : { x: [0, 150, 55], y: [0, 80, 130], scale: [1, 1.1, 0.96], opacity: [0.7, 1, 0.78] }}
        transition={ambientTransition}
      />

      <motion.div
        className="absolute -right-[25rem] -top-[16rem] h-[68rem] w-[68rem] rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.42)_0%,rgba(16,185,129,0.22)_32%,rgba(6,95,70,0.09)_54%,transparent_72%)] mix-blend-screen will-change-transform"
        animate={reduced ? undefined : { x: [0, -135, -45], y: [0, 105, 35], scale: [1, 0.94, 1.08], opacity: [0.68, 0.94, 0.74] }}
        transition={{ ...ambientTransition, duration: 28, delay: 1.5 }}
      />

      <motion.div
        className="absolute -bottom-[38rem] left-[2%] h-[76rem] w-[76rem] rounded-full bg-[radial-gradient(circle,rgba(74,222,128,0.44)_0%,rgba(22,163,74,0.22)_31%,rgba(20,83,45,0.08)_55%,transparent_73%)] mix-blend-screen will-change-transform"
        animate={reduced ? undefined : { x: [0, 155, 65], y: [0, -95, -30], scale: [1, 1.12, 1.02], opacity: [0.62, 0.9, 0.7] }}
        transition={{ ...ambientTransition, duration: 31, delay: 3 }}
      />

      <motion.div
        className="absolute left-[18%] top-[18%] h-[38rem] w-[38rem] rounded-full bg-[radial-gradient(circle,rgba(217,249,157,0.22)_0%,rgba(163,230,53,0.1)_36%,transparent_70%)] mix-blend-screen will-change-transform"
        animate={reduced ? undefined : { x: [0, 210, 80], y: [0, 130, 40], scale: [0.9, 1.12, 1] }}
        transition={{ ...ambientTransition, duration: 20, delay: 0.8 }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(5,8,6,0.28)_0%,rgba(5,8,6,0.08)_38%,transparent_67%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(5,8,6,0.04),transparent_36%,rgba(5,8,6,0.28))]" />
    </div>
  );
}
