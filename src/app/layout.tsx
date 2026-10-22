import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TrustVault | Ultra-Secure Document Sharing & Auditing',
  description: 'Zero-Leak authorization, private short-lived storage access, and tamper-evident cryptographic audit trails.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-shield-950 text-slate-100 min-h-screen antialiased flex flex-col">
        {children}
      </body>
    </html>
  );
}
