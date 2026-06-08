import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import DifyChatbot from '@/components/DifyChatbot';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'NhaDat Chatbot',
  description: 'Tư vấn bất động sản thông minh',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={inter.className}>
        {children}
        <DifyChatbot />
      </body>
    </html>
  );
}
