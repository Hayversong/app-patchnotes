import { QueryClient } from "@tanstack/react-query";
import axios from "axios";

/** Erros 4xx (payload inválido, 401, 404...) não melhoram com nova tentativa automática. */
function shouldRetry(failureCount: number, error: unknown) {
  if (axios.isAxiosError(error) && error.response && error.response.status < 500) return false;
  return failureCount < 1;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  });
}
