import { create } from "zustand";

import type { User } from "@/modules/auth/types/auth.types";

const TOKEN_COOKIE = "patchnotes_token";
// Igual à validade do refresh token (REFRESH_TOKEN_TTL_DAYS no backend): o access token pode expirar antes,
// mas a sessão é renovada automaticamente enquanto o refresh for válido.
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** Em HTTPS o cookie só trafega cifrado. Em http://localhost (desenvolvimento) o atributo impediria o cookie. */
function secureAttribute(): string {
  return typeof window !== "undefined" && window.location.protocol === "https:" ? "; secure" : "";
}

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
    document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${SESSION_MAX_AGE_SECONDS}; samesite=lax${secureAttribute()}`;
    set({ user, token, sessionExpired: false });
  },
  setUser: (user) => set({ user }),
  clearSession: (options) => {
    document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; samesite=lax${secureAttribute()}`;
    set({ user: null, token: null, sessionExpired: options?.expired ?? false });
  },
}));
