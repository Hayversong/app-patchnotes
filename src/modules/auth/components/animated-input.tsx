"use client";

import { motion, useReducedMotion } from "motion/react";
import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type AnimatedInputProps = React.ComponentPropsWithoutRef<typeof Input> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  success?: boolean;
};

export const AnimatedInput = React.forwardRef<HTMLInputElement, AnimatedInputProps>(
  ({ id, label, error, hint, success = false, className, ...props }, ref) => {
    const reduced = useReducedMotion();
    const describedBy = [hint && `${id}-hint`, error && `${id}-error`, props["aria-describedby"]]
      .filter(Boolean)
      .join(" ") || undefined;

    return (
      <motion.div
        className="group space-y-2"
        animate={reduced || !error ? { x: 0 } : { x: [0, -4, 4, -2, 2, 0] }}
        transition={{ duration: reduced ? 0 : 0.32, ease: "easeOut" }}
      >
        <Label
          htmlFor={id}
          className={cn(
            "transition-colors duration-200 group-focus-within:text-lime-300 motion-reduce:transition-none",
            error && "text-red-400 group-focus-within:text-red-400",
            success && "text-lime-400",
          )}
        >
          {label}
        </Label>
        <Input
          {...props}
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "transition-[border-color,box-shadow,background-color] duration-200 motion-reduce:transition-none",
            error && "border-red-400/70 bg-red-500/[0.04] focus-visible:border-red-400 focus-visible:ring-red-400/25",
            success && "border-lime-500/55 bg-lime-400/[0.025] focus-visible:border-lime-400 focus-visible:ring-lime-400/25",
            className,
          )}
        />
        {hint && <p id={`${id}-hint`} className="text-xs leading-5 text-muted-foreground">{hint}</p>}
        {error && (
          <motion.p id={`${id}-error`} role="alert" className="text-sm text-red-400" initial={reduced ? false : { opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.18 }}>
            {error}
          </motion.p>
        )}
      </motion.div>
    );
  },
);

AnimatedInput.displayName = "AnimatedInput";
