import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { SettingsProvider } from '@/components/settings/settings-provider'
import { Toaster } from '@/components/ui/sonner'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Resize the layout (not just the visual layer) when the virtual keyboard opens,
  // so the chat toolbar stays visible at the top and the textbox above the keyboard.
  interactiveWidget: 'resizes-content',
}

export const metadata: Metadata = {
  title: 'Orion',
  description: 'The first AI coding agent that understands your data',
  icons: {
    icon: [{url: '/favicon.png', type: 'image/png'}],
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SettingsProvider>{children}</SettingsProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
