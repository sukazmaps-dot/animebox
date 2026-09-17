import {
  AD_PROVIDER,
  ADS_ENABLED,
  MONETIZATION_ENABLED,
} from '@/lib/monetization';

type AdSlotProps = {
  placement: string;
  format?: 'horizontal' | 'rectangle' | 'native';
  className?: string;
};

/**
 * Provider-agnostic mount point for the future ad network.
 * It renders nothing until NEXT_PUBLIC_ADS_ENABLED=true.
 * No third-party script is injected by this component yet.
 */
export default function AdSlot({
  placement,
  format = 'horizontal',
  className = '',
}: AdSlotProps) {
  if (!MONETIZATION_ENABLED || !ADS_ENABLED) {
    return null;
  }

  return (
    <aside
      className={`monetization-ad monetization-ad--${format} ${className}`.trim()}
      data-ad-placement={placement}
      data-ad-provider={AD_PROVIDER}
      aria-label="Реклама"
    >
      <span className="monetization-ad__label">Реклама</span>
      <div
        className="monetization-ad__mount"
        data-ad-mount={placement}
      />
    </aside>
  );
}
