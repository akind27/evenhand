import type { ReactNode } from 'react';
import { connection } from 'next/server';
import { Atkinson_Hyperlegible_Next, Martian_Mono, Noto_Sans } from 'next/font/google';
import { DirectionContract } from '@/components/doc/DirectionContract';
import './globals.css';

const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '600', '700'],
  variable: '--font-atkinson',
  display: 'swap',
  adjustFontFallback: false,
});

// Atkinson has no Greek letters. Noto Sans covers them, after Atkinson in the stack so Latin stays Atkinson.
const noto = Noto_Sans({
  subsets: ['greek'],
  weight: ['400', '600', '700'],
  variable: '--font-noto',
  display: 'swap',
});

const martian = Martian_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  variable: '--font-martian',
  display: 'swap',
});

export const metadata = {
  title: 'Evenhand',
  description: 'Deposit without a passport for vehicle rental handovers.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Wait for a real request: the Content-Security-Policy nonce (src/proxy.ts) exists only per request.
  await connection();
  return (
    <html lang="en" className={`${atkinson.variable} ${noto.variable} ${martian.variable}`}>
      <body>
        <DirectionContract />
        {children}
      </body>
    </html>
  );
}
