import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/store/AuthContext'
import { LanguageProvider } from '@/store/LanguageContext'

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
      </body>
    </html>
  )
}
