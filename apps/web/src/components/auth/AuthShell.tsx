'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import styles from './AuthShell.module.css';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useTranslations('common');

  return (
    <div className={styles.page}>
      <div className={styles.hero} aria-hidden>
        <div className={styles.heroGlow} />
        <div className={styles.heroPattern} />
      </div>
      <div className={`${styles.panel} animate-fade-up`}>
        <p className={styles.brand}>{t('appName')}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
        <div className={styles.form}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
      <div className={styles.sideCopy}>
        <Link href="/login" className={styles.sideBrand}>
          {t('appName')}
        </Link>
        <p>Conversations with clarity — teal depth, warm panels, your rhythm.</p>
      </div>
    </div>
  );
}
