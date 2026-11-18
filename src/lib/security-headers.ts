/**
 * Content Security Policy do frontend (S6). Montada por requisição no middleware, com um nonce novo a cada
 * página: o Next 14 injeta scripts inline diferentes em cada resposta (payload do RSC), então hashes fixos não
 * funcionam e `'unsafe-inline'` em script-src anularia a proteção contra XSS.
 *
 * Exceções documentadas (docs/SEGURANCA.md):
 * - style-src 'unsafe-inline': atributos `style` gerados pelo React no SSR (gráficos, heatmap, animações do
 *   motion) não aceitam nonce. Estilos não executam código; o risco residual é CSS injetado.
 * - img-src https: — avatarUrl é uma URL livre informada pela pessoa no perfil.
 * - Só em desenvolvimento: 'unsafe-eval' (React Refresh/webpack), ws: (HMR) e http: em imagens.
 */

export const NONCE_HEADER = "x-nonce";

function websocketOrigin(): string | null {
  const url = process.env.NEXT_PUBLIC_CHAT_WS_URL;
  if (!url) return null;
  try {
    return new URL(url).origin.replace(/^http/, "ws");
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const chatSocket = websocketOrigin();
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic': scripts carregados por um script com nonce (chunks do Next) também são aceitos.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:", ...(isDev ? ["http:"] : [])],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(chatSocket ? [chatSocket] : []), ...(isDev ? ["ws:"] : [])],
    // Service worker do MSW (desenvolvimento) é servido pelo próprio app.
    "worker-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    ...(isDev ? {} : { "upgrade-insecure-requests": [] }),
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
