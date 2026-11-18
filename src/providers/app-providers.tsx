"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useEffect } from "react";

import { createQueryClient } from "@/lib/queryClient";

const queryClient = createQueryClient();

/** Todas as telas consomem a API real (/api/* encaminhado ao backend pelo next.config.mjs). */
export function AppProviders({ children }: { children: React.ReactNode }) {
  // Marca o fim da hidratação. Os testes ponta a ponta esperam por ela antes de digitar: texto digitado antes
  // disso é sobrescrito quando o React Hook Form registra os campos.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return <MotionConfig reducedMotion="user"><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></MotionConfig>;
}
