// Backend real (Parte 2): com API_URL definido, /api/* é encaminhado ao FastAPI no mesmo origin
// (cookies do refresh token continuam first-party). Sem API_URL, nada muda.
const apiUrl = process.env.API_URL?.replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
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
