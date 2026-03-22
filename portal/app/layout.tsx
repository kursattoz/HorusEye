import type { Metadata } from 'next';
import { Inter, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import './globals.css';

const inter = Inter({
  subsets:  ['latin'],
  weight:   ['400', '500', '600', '700'],
  variable: '--font-inter',
  display:  'swap',
});

const geistMono = Geist_Mono({
  subsets:  ['latin'],
  variable: '--font-geist-mono',
  display:  'swap',
});

export const metadata: Metadata = {
  title:       'HorusEye — AI Exam Proctoring',
  description: 'AI-based exam proctoring and monitoring system',
  manifest:    '/manifest.json',
  appleWebApp: {
    capable:        true,
    statusBarStyle: 'default',
    title:          'HorusEye',
  },
  icons: {
    icon:  [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192' }],
  },
};

/**
 * Inline script injected in <head> before any paint.
 * Reads the stored color-theme from localStorage and sets
 * data-color-theme on <html> to prevent a flash of wrong accent color.
 */
const COLOR_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('horuseye-color-theme')||'red';document.documentElement.setAttribute('data-color-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="tr"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable}`}
    >
      <head>
        {/* Apply color theme before first paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: COLOR_THEME_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          <OfflineBanner />
          <InstallPrompt />
          {children}
          <Toaster richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
