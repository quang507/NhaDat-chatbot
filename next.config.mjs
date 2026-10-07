/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // .eslintrc.json (thêm khi cài Vercel Speed Insights) tham chiếu vài rule
    // @typescript-eslint/* mà plugin không được cài (chỉ có @typescript-eslint/parser),
    // khiến `next build` fail thật ("Definition for rule ... was not found"). Lint nên
    // chạy riêng (npm run lint / CI), không chặn build production.
    ignoreDuringBuilds: true,
  },
  experimental: {
    outputFileTracingIncludes: {
      '/api/chat': ['./data.md', './persona.md', './index.json'],
      // api/slide doc thu muc public/images bang readdirSync luc runtime (duong dan
      // dong, khong the trace tinh) -> Vercel khong tu dong dong goi vao ham serverless
      // -> existsSync tra false -> mang anh rong. Phai khai ro de bundle theo.
      // + image_index.json: slide chon anh theo ngu nghia (lib/image-search.ts) - thieu
      // file nay tren Vercel thi moi slide khong co anh chon tay ra rong.
      // + slides.json: catalog slide doc bang fs luc runtime.
      '/api/slide': ['./public/images/**/*', './index.json', './image_index.json', './public/data/slides.json'],
      '/api/images': ['./image_index.json'],
    },
  },
};
export default nextConfig;
