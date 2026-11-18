import { create } from "zustand";

import type { User } from "@/modules/auth/types/auth.types";

/**
 * O access token vive num cookie HttpOnly gravado pela API (patchnotes_access): o JavaScript não o lê, então
 * um XSS não consegue roubá-lo. Aqui fica só o usuário e um indicador SEM segredo de que há sessão
 * (cookie patchnotes_session=1), usado para decidir telas e evitar chamadas inúteis à API.
 */
const SESSION_COOKIE = "patchnotes_session";
// Igual à validade do refresh token (REFRESH_TOKEN_TTL_DAYS no backend).
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** Em HTTPS o cookie só trafega cifrado. Em http://localhost (desenvolvimento) o atributo impediria o cookie. */
function secureAttribute(): string {
  return typeof window !== "undefined" && window.location.protocol === "https:" ? "; secure" : "";
}

function hasSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((item) => item === `${SESSION_COOKIE}=1`);
}

type AuthState = {
  user: User | null;
  /** Há sessão aberta neste navegador (a validade real quem decide é a API). */
  authenticated: boolean;
  /** Verdadeiro quando a sessão foi encerrada por um 401 da API (exibido na tela de login). */
  sessionExpired: boolean;
  setSession: (user: User) => void;
  setUser: (user: User) => void;
  clearSession: (options?: { expired?: boolean }) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  authenticated: hasSessionCookie(),
  sessionExpired: false,
  setSession: (user) => {
    document.cookie = `${SESSION_COOKIE}=1; path=/; max-age=${SESSION_MAX_AGE_SECONDS}; samesite=strict${secureAttribute()}`;
    set({ user, authenticated: true, sessionExpired: false });
  },
  setUser: (user) => set({ user }),
  clearSession: (options) => {
    document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; samesite=strict${secureAttribute()}`;
    set({ user: null, authenticated: false, sessionExpired: options?.expired ?? false });
  },
}));
