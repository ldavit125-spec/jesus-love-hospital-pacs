import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const sans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: '영상검사 목록 | 예수사랑병원 PACS',
  description: '예수사랑병원 의료영상정보시스템 UI 프로토타입',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body className={`${sans.variable} ${mono.variable}`}>{children}</body></html>;
}
