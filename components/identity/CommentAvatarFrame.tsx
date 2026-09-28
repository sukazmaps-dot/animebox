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
