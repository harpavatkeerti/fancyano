import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/authContext'

import { BRAND_NAME } from '@/lib/brand'

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: 'Wedding Rentals',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
