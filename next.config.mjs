// Backend real (Parte 2): com API_URL definido, /api/* é encaminhado ao FastAPI no mesmo origin
// (cookies do refresh token continuam first-party). Sem API_URL, nada muda.
const apiUrl = process.env.API_URL?.replace(/\/$/, "");

// Cabeçalhos fixos de segurança. A Content-Security-Policy usa nonce por requisição e fica em middleware.ts.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HSTS só tem efeito sob HTTPS (navegadores ignoram em HTTP); em desenvolvimento fica de fora.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return apiUrl ? [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }] : [];
  },
  // The development compiler cache can be left with a temporary rename file
  // when the dev server is restarted quickly on Windows. It is only a speed
  // optimization, so disable it in development to avoid noisy ENOENT errors.
  webpack(config) {
    config.cache = false;
    return config;
  },
};

export default nextConfig;
