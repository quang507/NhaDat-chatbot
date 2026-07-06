import type { Metadata } from 'next';
import { Inter, Be_Vietnam_Pro } from 'next/font/google';
import './globals.css';
import ChatWidgetWrapper from '@/components/ChatWidgetWrapper';

const inter = Inter({ subsets: ['latin', 'vietnamese'] });
// Font hiển thị tiêu đề slide — Be Vietnam Pro hỗ trợ đầy đủ dấu tiếng Việt
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'NhaDat Chatbot',
  description: 'Tư vấn bất động sản thông minh',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'NhaDat AI',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/logo.svg',
    apple: '/icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${inter.className} ${beVietnamPro.variable}`}>
        {children}
        <ChatWidgetWrapper />
      </body>
    </html>
  );
}
