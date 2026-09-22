"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";

import { createQueryClient } from "@/lib/queryClient";
import { ErrorState, LoadingState } from "@/components/ui/feedback";

const queryClient = createQueryClient();
let mockWorkerStartPromise: Promise<unknown> | undefined;

function startMockWorker() {
  mockWorkerStartPromise ??= import("@/mocks/browser").then(({ worker }) =>
    worker.start({ onUnhandledRequest: "bypass" }),
  );

  return mockWorkerStartPromise;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [mockError] = useState(false);

  useEffect(() => {
    let active = true;

    if (process.env.NODE_ENV !== "development") {
      setReady(true);
      return () => {
        active = false;
      };
    }

    // Do not block the entire application indefinitely on the development
    // service worker. In some browsers a stale worker registration can leave
    // `worker.start()` pending even though the page itself is healthy.
    const startupTimeout = new Promise<void>((resolve) => {
      window.setTimeout(resolve, 1500);
    });

    Promise.race([startMockWorker(), startupTimeout])
      .then(() => {
        if (active) setReady(true);
      })
      .catch((error) => {
        console.error("Falha ao iniciar a API simulada:", error);
        // The UI remains usable even when the optional mock API cannot start.
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  if (mockError) {
    return <main className="grid min-h-screen place-items-center p-6"><ErrorState message="Não foi possível abrir o Patchnotes." retry={() => window.location.reload()} /></main>;
  }

  if (!ready) {
    return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6"><LoadingState label="Abrindo o Patchnotes..." /></main>;
  }

  return <MotionConfig reducedMotion="user"><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></MotionConfig>;
}
