import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Content Dashboard',
  description: 'Blog artikel waarde dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        {children}
      </body>
    </html>
  )
}
