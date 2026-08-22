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
    // NEXT_PUBLIC_AI_ENGINE_URL tam bir URL olmalidir ("https://...").
    // Eksik/gecersiz degerde rewrite hic eklenmez ki sunucu
    // "Invalid rewrite found" ile crash etmesin (Railway'de basimiza geldi).
    const aiEngineUrl = process.env.NEXT_PUBLIC_AI_ENGINE_URL;
    if (!aiEngineUrl || !/^https?:\/\//.test(aiEngineUrl)) {
      return [];
    }
    return [
      {
        source: '/api/ai/:path*',
        destination: `${aiEngineUrl.replace(/\/+$/, '')}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;