"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";

import { createQueryClient } from "@/lib/queryClient";
import { ErrorState, LoadingState } from "@/components/ui/feedback";

const queryClient = createQueryClient();
const isDevelopment = process.env.NODE_ENV === "development";
/** Prazo para o worker confirmar a ativação. Esgotado, a inicialização é tratada como falha (nunca liberada). */
const MOCK_START_TIMEOUT_MS = 10_000;

type MockStatus = { state: "starting" } | { state: "ready" } | { state: "error"; detail: string };

let mockWorkerStartPromise: Promise<void> | undefined;

async function startMockWorker(): Promise<void> {
  const [{ worker }, { installScenarioInterceptor }] = await Promise.all([
    import("@/mocks/browser"),
    import("@/mocks/scenario-interceptor"),
  ]);
  installScenarioInterceptor();
  await worker.start({
    quiet: true,
    onUnhandledRequest(request, print) {
      // Chamadas à API sem handler são erro de contrato; assets do Next passam direto.
      if (new URL(request.url).pathname.startsWith("/api/")) print.error();
    },
  });
}

function startMockWorkerOnce(): Promise<void> {
  mockWorkerStartPromise ??= new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`o worker não respondeu em ${MOCK_START_TIMEOUT_MS / 1000}s`)), MOCK_START_TIMEOUT_MS);
    startMockWorker().then(resolve, reject).finally(() => window.clearTimeout(timer));
  }).catch((error: unknown) => {
    mockWorkerStartPromise = undefined; // permite nova tentativa
    throw error;
  });
  return mockWorkerStartPromise;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<MockStatus>(isDevelopment ? { state: "starting" } : { state: "ready" });
  const [attempt, setAttempt] = useState(0);
  const [MockBadge, setMockBadge] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    if (!isDevelopment) return;
    let active = true;
    setStatus({ state: "starting" });

    startMockWorkerOnce()
      .then(async () => {
        const { MockScenarioBadge } = await import("@/mocks/mock-scenario-badge");
        if (!active) return;
        setMockBadge(() => MockScenarioBadge);
        setStatus({ state: "ready" });
      })
      .catch((error: unknown) => {
        console.error("Falha ao iniciar a API simulada (MSW):", error);
        if (active) setStatus({ state: "error", detail: error instanceof Error ? error.message : String(error) });
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  if (status.state === "error") {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6">
        <h1 className="text-xl font-semibold">A API simulada não iniciou</h1>
        <ErrorState
          message="O Mock Service Worker (MSW) não ficou pronto, então as telas foram bloqueadas para evitar chamadas sem resposta simulada."
          hint={`Detalhe: ${status.detail}. Confirme que public/mockServiceWorker.js existe (npx msw init public) e que o navegador permite service workers em localhost.`}
          retry={() => setAttempt((value) => value + 1)}
        />
      </main>
    );
  }

  if (status.state === "starting") {
    return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6"><LoadingState label="Iniciando a API simulada..." /></main>;
  }

  return <MotionConfig reducedMotion="user"><QueryClientProvider client={queryClient}>{children}{MockBadge && <MockBadge />}</QueryClientProvider></MotionConfig>;
}
