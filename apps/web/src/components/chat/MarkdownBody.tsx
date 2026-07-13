'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { FormatMode } from '@/types';
import styles from './MarkdownBody.module.css';
import 'katex/dist/katex.min.css';

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), 'className'],
    span: [...(defaultSchema.attributes?.span || []), 'className', 'style'],
    div: [...(defaultSchema.attributes?.div || []), 'className', 'style'],
  },
};

export function MarkdownBody({
  content,
  formatMode = 'markdown',
}: {
  content: string;
  formatMode?: FormatMode | string;
}) {
  if (!content) return null;

  if (formatMode === 'plain') {
    return <div className={styles.body}>{content}</div>;
  }

  const withMath = formatMode === 'latex' || formatMode === 'markdown_latex';
  const source =
    formatMode === 'latex' && !content.includes('$')
      ? `$$\n${content}\n$$`
      : content;

  return (
    <div className={styles.body}>
      <ReactMarkdown
        remarkPlugins={withMath ? [remarkGfm, remarkMath] : [remarkGfm]}
        rehypePlugins={
          withMath
            ? [[rehypeSanitize, schema], rehypeKatex]
            : [[rehypeSanitize, schema]]
        }
        components={{
          a: ({ node: _node, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
            />
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
