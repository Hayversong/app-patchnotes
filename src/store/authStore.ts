import { create } from "zustand";

import type { User } from "@/modules/auth/types/auth.types";

const TOKEN_COOKIE = "patchnotes_token";

function readTokenCookie(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${TOKEN_COOKIE}=`;
  const cookie = document.cookie.split("; ").find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

type AuthState = {
  user: User | null;
  token: string | null;
  /** Verdadeiro quando a sessão foi encerrada por um 401 da API (exibido na tela de login). */
  sessionExpired: boolean;
  setSession: (user: User, token: string) => void;
  setUser: (user: User) => void;
  clearSession: (options?: { expired?: boolean }) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: readTokenCookie(),
  sessionExpired: false,
  setSession: (user, token) => {
    document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=86400; samesite=lax`;
    set({ user, token, sessionExpired: false });
  },
  setUser: (user) => set({ user }),
  clearSession: (options) => {
    document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; samesite=lax`;
    set({ user: null, token: null, sessionExpired: options?.expired ?? false });
  },
}));
