/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    after: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
