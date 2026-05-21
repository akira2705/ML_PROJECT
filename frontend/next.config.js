/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  experimental: { serverComponentsExternalPackages: ['playwright', 'cheerio'] },
}
module.exports = nextConfig
