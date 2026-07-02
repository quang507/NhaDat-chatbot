/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      '/api/chat': ['./data.md', './persona.md'],
      // api/slide doc thu muc public/images bang readdirSync luc runtime (duong dan
      // dong, khong the trace tinh) -> Vercel khong tu dong dong goi vao ham serverless
      // -> existsSync tra false -> mang anh rong. Phai khai ro de bundle theo.
      '/api/slide': ['./public/images/**/*'],
    },
  },
};
export default nextConfig;
