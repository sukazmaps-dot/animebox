export type EpisodeTimelineSegment = {
  startMs: number;
  endMs: number;
};

export type EpisodeTimelineLookupStatus =
  | 'pending'
  | 'found'
  | 'empty'
  | 'missing_identity'
  | 'error';

export type EpisodeTimelineMeta = {
  animeId: number;
  episode: number;
  durationMs: number | null;
  opening: EpisodeTimelineSegment | null;
  ending: EpisodeTimelineSegment | null;
  recap: EpisodeTimelineSegment | null;
  skipSource: string | null;
  skipConfidence: number | null;
  lookupStatus: EpisodeTimelineLookupStatus;
  checkedAt: string | null;
};

export type EpisodeTimelineResponse = {
  ok: true;
  timeline: EpisodeTimelineMeta;
};
