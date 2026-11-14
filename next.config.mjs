/**
 * The Elric backend ships no CORS middleware, so browser calls go
 * same-origin and Next.js proxies them to the backend. Point API_URL at
 * the backend (default http://localhost:8000). For a deployed backend,
 * set NEXT_PUBLIC_API_URL instead and the client calls it directly.
 */
/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL || "http://localhost:8000";

const nextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
      { source: "/health", destination: `${API_URL}/health` },
    ];
  },
};

export default nextConfig;
