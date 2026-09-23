import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  size?: 'compact' | 'default' | 'large';
};

export default function AnimeBoxIconCore({
  children,
  className = '',
  size = 'default',
}: Props) {
  return (
    <span
      className={`ab-icon-core ab-icon-core--${size} ${className}`.trim()}
      aria-hidden="true"
    >
      <span className="ab-icon-core__aura" />
      <span className="ab-icon-core__shell">{children}</span>
    </span>
  );
}
