import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const plusJakarta = localFont({
  src: './fonts/plus-jakarta-sans.woff2',
  weight: '400 700',
  variable: '--font-plus-jakarta',
  display: 'swap',
});

const dmSans = localFont({
  src: './fonts/dm-sans.woff2',
  weight: '400 700',
  variable: '--font-dm-sans',
  display: 'swap',
});

const jetbrainsMono = localFont({
  src: './fonts/jetbrains-mono.woff2',
  weight: '400 600',
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Folio — Minimalist Browser, Markdown & PDF Studio',
  description:
    'A lightweight unified workspace combining a minimalist web browser, CodeMirror Markdown editor, and professional PDF studio with annotation, page organization, and high-DPI image export.',
  openGraph: {
    title: 'Folio — Minimalist Browser, Markdown & PDF Studio',
    description:
      'A lightweight unified workspace combining a minimalist web browser, CodeMirror Markdown editor, and professional PDF studio.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Folio — Minimalist Browser, Markdown & PDF Studio',
    description:
      'A lightweight unified workspace combining a minimalist web browser, CodeMirror Markdown editor, and professional PDF studio.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${plusJakarta.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased selection:bg-blue-500/25" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
