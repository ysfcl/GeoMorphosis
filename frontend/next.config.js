/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@prisma/adapter-better-sqlite3', 'better-sqlite3'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.copernicus.eu',
      },
      {
        protocol: 'https',
        hostname: 'firms.modaps.eosdis.nasa.gov',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/ai/:path*',
        destination: `${process.env.NEXT_PUBLIC_AI_ENGINE_URL || 'http://localhost:8000'}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;