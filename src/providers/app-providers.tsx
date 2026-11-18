"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";

import { createQueryClient } from "@/lib/queryClient";

const queryClient = createQueryClient();

/** Todas as telas consomem a API real (/api/* encaminhado ao backend pelo next.config.mjs). */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user"><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></MotionConfig>;
}
