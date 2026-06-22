/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      '/api/chat': ['./data.md', './persona.md'],
    },
  },
};
export default nextConfig;
