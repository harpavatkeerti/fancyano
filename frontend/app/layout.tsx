import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/authContext'

export const metadata: Metadata = {
  title: 'FAN-C-YA-NO',
  description: 'Manage your rental store bookings',
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
