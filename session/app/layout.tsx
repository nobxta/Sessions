import type { Metadata } from 'next'
import './globals.css'
import PageLayoutWrapper from '@/components/PageLayoutWrapper'

export const metadata: Metadata = {
  title: 'Session Manager',
  description: 'Professional Telegram session management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <PageLayoutWrapper>
          {children}
        </PageLayoutWrapper>
      </body>
    </html>
  )
}

