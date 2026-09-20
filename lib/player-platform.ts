export type PlayerDeliveryMode = 'iframe' | 'direct-hls' | 'direct-video';
export type PlayerQualityConfidence = 'verified' | 'provider-reported' | 'unknown';
export type PlayerSourceMode = 'auto' | 'manual';

export type PlayerQualityInfo = {
  label: string;
  confidence: PlayerQualityConfidence;
  width?: number | null;
  height?: number | null;
};

export function normalizeProviderId(value?: string | null) {
  const normalized = value?.trim().toLocaleLowerCase('ru-RU') || 'unknown';
  return normalized.replace(/[^a-z0-9а-яё._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

export function mediaTypeToDeliveryMode(
  mediaType: 'hls' | 'iframe' | 'video' | 'kodik' | string | undefined,
): PlayerDeliveryMode {
  if (mediaType === 'hls') return 'direct-hls';
  if (mediaType === 'video') return 'direct-video';
  return 'iframe';
}

export function playerDeliveryLabel(mode: PlayerDeliveryMode) {
  if (mode === 'direct-hls') return 'HLS';
  if (mode === 'direct-video') return 'Video';
  return 'Iframe';
}

export function parseProviderReportedQuality(value?: string | null): PlayerQualityInfo | null {
  const text = value?.trim();
  if (!text) return null;

  if (/\b4k\b/i.test(text)) {
    return { label: '2160p', confidence: 'provider-reported' };
  }

  const match = text.match(/(?:^|\D)(2160|1440|1080|720|576|480|360)p?(?:\D|$)/i);
  if (!match) return null;

  return {
    label: `${match[1]}p`,
    confidence: 'provider-reported',
  };
}

export function verifiedVideoQuality(width: number, height: number): PlayerQualityInfo | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const roundedHeight = Math.round(height);
  let label = `${Math.round(width)}×${roundedHeight}`;

  if (roundedHeight >= 2100) label = '2160p';
  else if (roundedHeight >= 1400) label = '1440p';
  else if (roundedHeight >= 1000) label = '1080p';
  else if (roundedHeight >= 700) label = '720p';
  else if (roundedHeight >= 550) label = '576p';
  else if (roundedHeight >= 450) label = '480p';
  else if (roundedHeight >= 330) label = '360p';

  return {
    label,
    confidence: 'verified',
    width: Math.round(width),
    height: roundedHeight,
  };
}

export function playerQualityLabel(quality: PlayerQualityInfo | null, deliveryMode: PlayerDeliveryMode) {
  if (quality?.confidence === 'verified') return `${quality.label} · подтверждено`;
  if (quality?.confidence === 'provider-reported') return `${quality.label} · заявлено источником`;
  if (deliveryMode === 'iframe') return 'Качество контролирует источник';
  return 'Авто · ожидаем данные потока';
}
