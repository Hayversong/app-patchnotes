/**
 * Content Security Policy do frontend (S6). Montada por requisição no middleware, com um nonce novo a cada
 * página: o Next 14 injeta scripts inline diferentes em cada resposta (payload do RSC), então hashes fixos não
 * funcionam e `'unsafe-inline'` em script-src anularia a proteção contra XSS.
 *
 * Exceções documentadas (docs/SEGURANCA.md):
 * - style-src 'unsafe-inline': atributos `style` gerados pelo React no SSR (gráficos, heatmap, animações do
 *   motion) não aceitam nonce. Estilos não executam código; o risco residual é CSS injetado.
 * - img-src só do próprio endereço: a foto de perfil é enviada como arquivo e servida pela API (/api/profile/avatar).
 * - Só em desenvolvimento: 'unsafe-eval' (React Refresh/webpack) e ws: (HMR).
 */

import { chatSocketSetting } from "@/lib/config";

export const NONCE_HEADER = "x-nonce";

/** Origem do WebSocket do chat quando ele fica em outro endereço. Caminho relativo já é coberto por 'self'. */
function websocketOrigin(): string | null {
  if (chatSocketSetting.startsWith("/")) return null;
  try {
    return new URL(chatSocketSetting).origin.replace(/^http/, "ws");
  } catch {
    return null;
  }
}

/**
 * `https`: a página foi servida por HTTPS (direto ou atrás de um proxy que informa X-Forwarded-Proto).
 * Só então entra `upgrade-insecure-requests`. Em HTTP ela quebraria o site: o Safari/WebKit troca
 * http://localhost por https:// em todos os recursos (Chrome e Firefox abrem exceção só para localhost).
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean, https = false): string {
  const chatSocket = websocketOrigin();
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic': scripts carregados por um script com nonce (chunks do Next) também são aceitos.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(chatSocket ? [chatSocket] : []), ...(isDev ? ["ws:"] : [])],
    "worker-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    ...(https && !isDev ? { "upgrade-insecure-requests": [] } : {}),
  };
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}
