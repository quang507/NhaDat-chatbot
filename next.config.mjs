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
      // api/slide kiem anh ton tai qua image_manifest.json (sinh luc build) - KHONG
      // dong goi public/images (~72 MB) vao ham: moi ban deploy se luu them chung do
      // vao Functions Storage. Anh van do CDN phuc vu tu /public.
      // + image_index.json: slide chon anh theo ngu nghia (lib/image-search.ts) - thieu
      // file nay tren Vercel thi moi slide khong co anh chon tay ra rong.
      // + slides.json: catalog slide doc bang fs luc runtime.
      '/api/slide': ['./image_manifest.json', './index.json', './image_index.json', './public/data/slides.json'],
      '/api/images': ['./image_index.json'],
    },
    // nft tu trace path.join(cwd, 'public', ...) (nhanh du phong dev cua imageExists)
    // ra ca public/images -> loai ra, chi giu image_manifest.json.
    outputFileTracingExcludes: {
      '/api/slide': ['./public/images/**/*', './public/images_bg/**/*'],
    },
  },
};
export default nextConfig;
