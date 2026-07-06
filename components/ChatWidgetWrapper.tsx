'use client';

import { usePathname } from 'next/navigation';
import ChatWidget from './ChatWidget';

export default function ChatWidgetWrapper() {
  const pathname = usePathname();

  if (pathname === '/embed') return null;

  return <ChatWidget />;
}
