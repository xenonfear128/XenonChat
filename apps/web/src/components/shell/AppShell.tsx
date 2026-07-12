'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui';
import { useAuthStore } from '@/stores/auth';
import styles from './AppShell.module.css';

const NAV = [
  { href: '/chats', key: 'chats' as const },
  { href: '/contacts', key: 'contacts' as const },
  { href: '/moments', key: 'moments' as const },
  { href: '/settings', key: 'settings' as const },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  return (
    <div className={styles.shell}>
      <nav className={styles.rail} aria-label="Main">
        <Link href="/chats" className={styles.brand} title="XenonChat">
          <span className={styles.mark}>X</span>
        </Link>
        <div className={styles.navItems}>
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${active ? styles.navActive : ''}`}
              >
                <span className={styles.navLabel}>{t(item.key)}</span>
              </Link>
            );
          })}
        </div>
        <Link href="/settings" className={styles.profile}>
          <Avatar name={user?.nickname || 'U'} src={user?.avatar_url} size={36} />
        </Link>
      </nav>
      <div className={styles.content}>{children}</div>
      <nav className={styles.mobileNav} aria-label="Mobile">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.mobileItem} ${active ? styles.navActive : ''}`}
            >
              {t(item.key)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
