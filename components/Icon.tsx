import type { SVGProps } from 'react';

type IconName =
  | 'home'
  | 'anime'
  | 'calendar'
  | 'tracker'
  | 'heart'
  | 'bell'
  | 'telegram'
  | 'info'
  | 'search'
  | 'chevron'
  | 'play'
  | 'plus'
  | 'star'
  | 'menu'
  | 'user'
  | 'clock'
  | 'spark'
  | 'trophy'
  | 'mail';

type Props = SVGProps<SVGSVGElement> & { name: IconName };

export default function Icon({ name, ...props }: Props) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };

  switch (name) {
    case 'home':
      return <svg {...common}><path d="m3 10 9-7 9 7"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/></svg>;
    case 'anime':
      return <svg {...common}><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 2v3M16 2v3M7 9h10M8 14h.01M12 14h.01M16 14h.01"/></svg>;
    case 'calendar':
      return <svg {...common}><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 9h18"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"/></svg>;
    case 'tracker':
      return <svg {...common}><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>;
    case 'heart':
      return <svg {...common}><path d="M20.8 8.6c0 5.4-8.8 10-8.8 10s-8.8-4.6-8.8-10A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.5Z"/></svg>;
    case 'bell':
      return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>;
    case 'telegram':
      return <svg {...common}><path d="m22 3-7.2 18-4.2-6.1L4 12.5 22 3Z"/><path d="m10.6 14.9 7-6.8-9.2 5.4"/></svg>;
    case 'info':
      return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>;
    case 'search':
      return <svg {...common}><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>;
    case 'chevron':
      return <svg {...common}><path d="m9 18 6-6-6-6"/></svg>;
    case 'play':
      return <svg {...common} fill="currentColor" stroke="none"><path d="m9 6 10 6-10 6V6Z"/></svg>;
    case 'plus':
      return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case 'star':
      return <svg {...common} fill="currentColor" stroke="none"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>;
    case 'menu':
      return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16"/></svg>;
    case 'user':
      return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>;
    case 'clock':
      return <svg {...common}><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>;
    case 'spark':
      return <svg {...common} fill="currentColor" stroke="none"><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Zm7 13 .9 3.1L23 19l-3.1.9L19 23l-.9-3.1L15 19l3.1-.9L19 15Z"/></svg>;
    case 'trophy':
      return <svg {...common}><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v1a4 4 0 0 0 4 4M16 6h3v1a4 4 0 0 1-4 4M12 12v4M9 20h6M10 16h4v4h-4z"/></svg>;
    case 'mail':
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg>;
  }
}
