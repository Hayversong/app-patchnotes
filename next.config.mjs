/** @type {import('next').NextConfig} */
const nextConfig = {
  // The development compiler cache can be left with a temporary rename file
  // when the dev server is restarted quickly on Windows. It is only a speed
  // optimization, so disable it in development to avoid noisy ENOENT errors.
  webpack(config) {
    config.cache = false;
    return config;
  },
};

export default nextConfig;
