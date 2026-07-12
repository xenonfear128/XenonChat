import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export const locales = ['zh-CN', 'en-US'] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = 'zh-CN';

export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get('NEXT_LOCALE')?.value;
  const locale: AppLocale = locales.includes(raw as AppLocale)
    ? (raw as AppLocale)
    : defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
