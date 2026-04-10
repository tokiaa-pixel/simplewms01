import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/store/AuthContext'

export const metadata: Metadata = {
  title: 'SimpleWMS - 在庫管理システム',
  description: 'シンプルな在庫管理システム',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
