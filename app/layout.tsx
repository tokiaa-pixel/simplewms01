import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/store/AuthContext'
import { LanguageProvider } from '@/store/LanguageContext'
import { Analytics } from '@vercel/analytics/next'

export const metadata: Metadata = {
  title: 'SimpleWMS',
  description: 'Warehouse Management System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className="antialiased">
        <LanguageProvider>
          <AuthProvider>{children}</AuthProvider>
        </LanguageProvider>
        <Analytics />
      </body>
    </html>
  )
}
