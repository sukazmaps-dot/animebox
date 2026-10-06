const missing = new Set(['episode_unavailable', 'not_found', 'direct_stream_not_found']);

/** A missing fallback must not disguise an earlier failed/unfinished check. */
export function sourceFailureReason(reasons: string[], budgetExpired: boolean) {
  if (budgetExpired) return 'discovery_budget_exhausted';
  if (reasons.some(reason => reason === 'provider_timeout')) return 'provider_timeout';
  const uncertain = reasons.find(reason => reason && !missing.has(reason) && reason !== 'copyright_restricted');
  if (uncertain) return uncertain;
  if (reasons.length && reasons.every(reason => reason === 'copyright_restricted')) return 'copyright_restricted';
  return reasons.find(reason => missing.has(reason)) ?? 'no_playable_source';
}
