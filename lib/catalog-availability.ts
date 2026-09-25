export type CatalogAvailabilityStatus =
  | 'playable'
  | 'unknown'
  | 'unavailable';

export type CatalogProviderAvailabilityStatus =
  | 'available'
  | 'unknown'
  | 'unavailable';

export type CatalogAvailabilityRow = {
  anime_id: number;
  mal_id: number | null;
  availability_status: CatalogAvailabilityStatus;
  kodik_status: CatalogProviderAvailabilityStatus;
  aniliberty_status: CatalogProviderAvailabilityStatus;
  direct_status: CatalogProviderAvailabilityStatus;
  max_episode: number | null;
  consecutive_misses: number;
  last_checked_at: string | null;
  next_check_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_reason: string | null;
  created_at?: string;
  updated_at: string;
};

export type CatalogHealthSnapshot = {
  generatedAt: string;
  counts: {
    total: number;
    playable: number;
    unknown: number;
    unavailable: number;
    stale: number;
  };
  recentUnavailable: Array<{
    animeId: number;
    malId: number | null;
    consecutiveMisses: number;
    lastCheckedAt: string | null;
    nextCheckAt: string | null;
    reason: string | null;
  }>;
};
