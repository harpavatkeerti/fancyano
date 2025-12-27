import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Rental Booking System',
  description: 'Manage your rental store bookings',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">{children}</body>
    </html>
  )
}
