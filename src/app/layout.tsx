import type { Metadata } from 'next';
import '@/styles/globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'DeepTerm - Modern SSH Client Built for macOS',
  description:
    'Professional SSH connectivity with AI-powered assistance, split terminals, and native macOS performance. The modern SSH client built for developers, DevOps engineers, and system administrators.',
  keywords: [
    'SSH client',
    'macOS',
    'terminal',
    'DevOps',
    'system administration',
    'AI assistant',
    'SwiftUI',
  ],
  authors: [{ name: 'DeepTerm' }],
  openGraph: {
    title: 'DeepTerm - Modern SSH Client Built for macOS',
    description:
      'Professional SSH connectivity with AI-powered assistance, split terminals, and native macOS performance.',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DeepTerm - Modern SSH Client Built for macOS',
    description:
      'Professional SSH connectivity with AI-powered assistance, split terminals, and native macOS performance.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background-primary text-text-primary antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
