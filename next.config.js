/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Allow remote access during development (just hostnames, not full URLs)
  allowedDevOrigins: [
    'http://10.10.10.10',
    'http://192.168.20.177',
    'http://rpcm4node2',
  ],
};

module.exports = nextConfig;
