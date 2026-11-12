import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { NONCE_HEADER, buildContentSecurityPolicy, createNonce } from "@/lib/security-headers";

const protectedRoutes = ["/dashboard", "/chat", "/devlog", "/profile"];
const authRoutes = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const token = request.cookies.get("patchnotes_token")?.value;
  const { pathname } = request.nextUrl;

  if (protectedRoutes.some((route) => pathname.startsWith(route)) && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (authRoutes.includes(pathname) && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // CSP com nonce por requisição. O Next lê o nonce do cabeçalho Content-Security-Policy da REQUISIÇÃO e o
  // aplica aos próprios scripts; a RESPOSTA leva a mesma política para o navegador.
  const nonce = createNonce();
  const policy = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

// Todas as páginas (para a CSP); ficam de fora a API, os arquivos estáticos e o service worker do MSW.
export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|mockServiceWorker.js).*)"],
};
