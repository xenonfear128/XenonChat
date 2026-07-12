'use client';

import { useTranslations } from 'next-intl';
import { ConversationList } from '@/components/chat/ConversationList';
import styles from './chats.module.css';

export default function ChatsPage() {
  const t = useTranslations('chat');

  return (
    <div className={styles.threeCol}>
      <div className={styles.listCol}>
        <ConversationList />
      </div>
      <div className={`${styles.chatCol} ${styles.emptyChat}`}>
        <div className="animate-fade-up">
          <h2>XenonChat</h2>
          <p>{t('selectConversation')}</p>
        </div>
      </div>
      <div className={styles.detailColHidden} />
    </div>
  );
}
