import type { Metadata } from 'next';
import { Fraunces, Source_Sans_3 } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from '@/lib/providers';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-source-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'XenonChat',
  description: 'XenonChat — modern messaging',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${fraunces.variable} ${sourceSans.variable}`}
      suppressHydrationWarning
    >
      <body
        style={{
          fontFamily: 'var(--font-source-sans), var(--font-body)',
          // display font available via CSS var
        }}
      >
        <style>{`:root{--font-display:var(--font-fraunces),Georgia,serif;--font-body:var(--font-source-sans),'Source Sans 3',sans-serif;}`}</style>
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
