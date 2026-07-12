'use client';

import type { LinkPreview } from '@/types';
import styles from './LinkPreviewCard.module.css';

export function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  return (
    <a
      className={styles.card}
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {preview.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.image} src={preview.image_url} alt="" />
      ) : null}
      <div className={styles.meta}>
        <div className={styles.site}>
          {preview.favicon_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.favicon_url} alt="" />
          ) : null}
          <span>{preview.site_name || preview.domain || 'Link'}</span>
        </div>
        <strong>{preview.title || preview.url}</strong>
        {preview.description ? <p>{preview.description}</p> : null}
      </div>
    </a>
  );
}
