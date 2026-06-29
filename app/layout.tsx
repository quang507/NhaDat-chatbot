import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ChatWidget from '@/components/ChatWidget';

const inter = Inter({ subsets: ['latin'] });

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
      <body className={inter.className}>
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
