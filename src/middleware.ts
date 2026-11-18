import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { NONCE_HEADER, buildContentSecurityPolicy, createNonce } from "@/lib/security-headers";

const protectedRoutes = ["/dashboard", "/chat", "/devlog", "/tokens", "/profile"];
const authRoutes = ["/login", "/register"];

export function middleware(request: NextRequest) {
  // patchnotes_access: cookie HttpOnly da API (o middleware, no servidor, consegue ler; o JavaScript, não).
  // patchnotes_session: indicador sem segredo que o frontend apaga ao encerrar a sessão. Como o JavaScript não
  // apaga o cookie HttpOnly, um access vencido pode sobrar; por isso sair das telas de login exige os dois,
  // senão /login e /dashboard ficariam se mandando de um para o outro.
  const hasAccess = Boolean(request.cookies.get("patchnotes_access")?.value);
  const hasSession = request.cookies.get("patchnotes_session")?.value === "1";
  const { pathname } = request.nextUrl;

  if (protectedRoutes.some((route) => pathname.startsWith(route)) && !hasAccess) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (authRoutes.includes(pathname) && hasAccess && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // CSP com nonce por requisição. O Next lê o nonce do cabeçalho Content-Security-Policy da REQUISIÇÃO e o
  // aplica aos próprios scripts; a RESPOSTA leva a mesma política para o navegador.
  const nonce = createNonce();
  const https = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const policy = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development", https);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

// Todas as páginas (para a CSP); ficam de fora a API e os arquivos estáticos.
export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
