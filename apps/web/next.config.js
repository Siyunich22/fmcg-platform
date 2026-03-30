/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const apiUrl =
      process.env.API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:8000";
    const backendRoutes = [
      "upload",
      "dashboard",
      "sales",
      "stock",
      "debts",
      "orders",
      "branches",
    ];
    return backendRoutes.map((route) => ({
      source: `/api/${route}/:path*`,
      destination: `${apiUrl}/api/${route}/:path*`,
    }));
  },
};

module.exports = nextConfig;
