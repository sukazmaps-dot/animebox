import type { ReactNode } from 'react';

import { compactProfileFrameAsset } from '@/lib/profile-frames';

import styles from './CommentAvatarFrame.module.css';

export default function CommentAvatarFrame({
  frameKey,
  className = '',
}: {
  frameKey?: string | null;
  className?: string;
}) {
  const asset = compactProfileFrameAsset(frameKey);
  if (!asset) return null;

  return (
    <span
      className={`${styles.frame} ${className}`.trim()}
      data-comment-profile-frame={frameKey}
      aria-hidden="true"
    >
      {/* Dense social surfaces intentionally use static frame assets. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset}
        alt=""
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        draggable={false}
      />
    </span>
  );
}


export function CommentAvatarFrameShell({
  frameKey,
  children,
}: {
  frameKey?: string | null;
  children: ReactNode;
}) {
  return (
    <span
      className={styles.avatarRoot}
      data-has-comment-frame={compactProfileFrameAsset(frameKey) ? 'true' : 'false'}
    >
      {children}
      <CommentAvatarFrame frameKey={frameKey} />
    </span>
  );
}
