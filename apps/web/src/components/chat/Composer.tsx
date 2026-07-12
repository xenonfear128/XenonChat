'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Segmented } from '@/components/ui';
import { MarkdownBody } from './MarkdownBody';
import { api } from '@/lib/api';
import { useUiStore } from '@/stores/ui';
import type { FormatMode } from '@/types';
import styles from './Composer.module.css';

type Props = {
  onSend: (payload: {
    body: string;
    format_mode: FormatMode;
    message_type: 'text' | 'image' | 'file' | 'voice';
    attachment_ids?: string[];
  }) => Promise<void> | void;
  disabled?: boolean;
};

export function Composer({ onSend, disabled }: Props) {
  const t = useTranslations('chat');
  const tc = useTranslations('common');
  const formatMode = useUiStore((s) => s.formatMode);
  const setFormatMode = useUiStore((s) => s.setFormatMode);
  const preview = useUiStore((s) => s.composerPreview);
  const setPreview = useUiStore((s) => s.setComposerPreview);
  const quote = useUiStore((s) => s.quote);
  const setQuote = useUiStore((s) => s.setQuote);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const imageRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      mediaRecorder.current?.stop();
    };
  }, []);

  const submit = async () => {
    const body = text.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    try {
      await onSend({ body, format_mode: formatMode, message_type: 'text' });
      setText('');
      setQuote(null);
    } finally {
      setSending(false);
    }
  };

  const uploadAndSend = async (file: File, message_type: 'image' | 'file' | 'voice') => {
    setSending(true);
    try {
      const media = await api.uploadMedia(file, message_type);
      await onSend({
        body: message_type === 'voice' ? '' : file.name,
        format_mode: 'plain',
        message_type,
        attachment_ids: [media.id],
      });
    } finally {
      setSending(false);
    }
  };

  const toggleRecord = async () => {
    if (recording) {
      mediaRecorder.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunks.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        await uploadAndSend(file, 'voice');
      };
      mediaRecorder.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  return (
    <div className={styles.composer}>
      {quote ? (
        <div className={styles.quoteBar}>
          <div>
            <strong>{t('replyingTo')} {quote.display_name || ''}</strong>
            <span>{quote.snapshot_text}</span>
          </div>
          <button type="button" onClick={() => setQuote(null)} aria-label={t('cancelQuote')}>
            ×
          </button>
        </div>
      ) : null}

      <div className={styles.toolbar}>
        <Segmented<FormatMode>
          value={formatMode === 'markdown_latex' ? 'latex' : (formatMode as FormatMode)}
          options={[
            { value: 'plain', label: t('modePlain') },
            { value: 'markdown', label: t('modeMarkdown') },
            { value: 'latex', label: t('modeLatex') },
          ]}
          onChange={(v) => setFormatMode(v === 'latex' ? 'markdown_latex' : v)}
        />
        {(formatMode === 'markdown' || formatMode === 'latex' || formatMode === 'markdown_latex') && (
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => setPreview(!preview)}
          >
            {preview ? t('edit') : t('preview')}
          </button>
        )}
        <div className={styles.spacer} />
        <button type="button" className={styles.toolBtn} onClick={() => imageRef.current?.click()}>
          {t('attachImage')}
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => fileRef.current?.click()}>
          {t('attachFile')}
        </button>
        <button
          type="button"
          className={`${styles.toolBtn} ${recording ? styles.recording : ''}`}
          onClick={toggleRecord}
        >
          {recording ? t('stopRecording') : t('voice')}
        </button>
      </div>

      {preview ? (
        <div className={styles.preview}>
          <MarkdownBody content={text || ' '} formatMode={formatMode} />
        </div>
      ) : (
        <textarea
          className={styles.textarea}
          value={text}
          placeholder={t('typeMessage')}
          rows={3}
          disabled={disabled || sending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
      )}

      <div className={styles.footer}>
        <span className={styles.hint}>Enter ↵ · Shift+Enter</span>
        <Button onClick={() => void submit()} disabled={disabled || sending || !text.trim()}>
          {sending ? '…' : tc('send')}
        </Button>
      </div>

      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadAndSend(f, 'image');
          e.target.value = '';
        }}
      />
      <input
        ref={fileRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadAndSend(f, 'file');
          e.target.value = '';
        }}
      />
    </div>
  );
}
