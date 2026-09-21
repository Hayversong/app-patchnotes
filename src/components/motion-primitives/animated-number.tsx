"use client";

// Adapted from motion-primitives AnimatedNumber (MIT).
// https://motion-primitives.com/docs/animated-number
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

export function formatMetric(value: number, format: "number" | "minutes" = "number") {
  const rounded = Math.max(0, Math.round(value));
  return format === "minutes"
    ? `${Math.floor(rounded / 60)}h ${rounded % 60}min`
    : rounded.toLocaleString("pt-BR");
}

export function AnimatedNumber({ value, format = "number", suffix = "" }: {
  value: number; format?: "number" | "minutes"; suffix?: string;
}) {
  const reduced = useReducedMotion();
  const spring = useSpring(reduced ? value : 0, { stiffness: 160, damping: 30, restDelta: 0.05 });
  const display = useTransform(spring, (current) => formatMetric(current, format) + suffix);
  useEffect(() => {
    if (reduced) spring.jump(value);
    else spring.set(value);
  }, [value, spring, reduced]);
  return <span className="tabular-nums">
    <span className="sr-only">{formatMetric(value, format)}{suffix}</span>
    {reduced ? <span aria-hidden="true">{formatMetric(value, format)}{suffix}</span> : <motion.span aria-hidden="true">{display}</motion.span>}
  </span>;
}
