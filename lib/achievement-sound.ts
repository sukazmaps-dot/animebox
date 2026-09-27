'use client';

export type AchievementSoundRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';

export type AchievementSoundKind =
  | 'character_intro'
  | 'battle'
  | 'tension'
  | 'reveal'
  | 'secret'
  | 'death'
  | 'finale'
  | 'arc_complete'
  | 'episode_milestone'
  | string;

export const ACHIEVEMENT_SOUND_STORAGE_KEY =
  'animebox:achievement-sounds-enabled';
export const ACHIEVEMENT_SOUND_VOLUME = 0.32;

const ACHIEVEMENT_SOUND_COOLDOWN_MS = 900;
const PLAYED_EVENT_CACHE_LIMIT = 120;

const SOUND_BY_RARITY: Record<AchievementSoundRarity, string> = {
  common: '/audio/achievements/common-sparkle.mp3',
  uncommon: '/audio/achievements/common-sparkle.mp3',
  rare: '/audio/achievements/rare-wand.mp3',
  epic: '/audio/achievements/epic-whoosh.mp3',
  legendary: '/audio/achievements/legendary-spell.mp3',
};

const REVEAL_SOUND = '/audio/achievements/reveal-chime.mp3';

const RARITY_PRIORITY: Record<AchievementSoundRarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

type PendingSound = {
  src: string;
  priority: number;
};

const playedEventIds = new Set<string>();

let soundChannel: HTMLAudioElement | null = null;
let pendingSound: PendingSound | null = null;
let lastPlayedAt = 0;
let lastPriority = 0;
let soundUnlocked = false;

function browserReady() {
  return typeof window !== 'undefined' && typeof Audio !== 'undefined';
}

function notifySoundState() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('animebox:achievement-sound-state', {
      detail: {
        unlocked: soundUnlocked,
        enabled: achievementSoundsEnabled(),
      },
    }),
  );
}

function rememberPlayedEvent(eventId: string) {
  playedEventIds.add(eventId);

  while (playedEventIds.size > PLAYED_EVENT_CACHE_LIMIT) {
    const oldest = playedEventIds.values().next().value as string | undefined;
    if (!oldest) break;
    playedEventIds.delete(oldest);
  }
}

function soundEnabledFromStorage() {
  if (typeof window === 'undefined') return true;

  try {
    return window.localStorage.getItem(ACHIEVEMENT_SOUND_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function channel() {
  if (!browserReady()) return null;

  if (!soundChannel) {
    soundChannel = new Audio();
    soundChannel.preload = 'auto';
    soundChannel.volume = ACHIEVEMENT_SOUND_VOLUME;
  }

  return soundChannel;
}

function stopChannel() {
  if (!soundChannel) return;

  try {
    soundChannel.pause();
    soundChannel.currentTime = 0;
  } catch {
    // Achievement audio must never affect playback.
  }
}

function isAutoplayError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'AbortError')
  );
}

export function achievementSoundsEnabled() {
  return soundEnabledFromStorage();
}

export function achievementSoundUnlocked() {
  return soundUnlocked;
}

export function setAchievementSoundsEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      ACHIEVEMENT_SOUND_STORAGE_KEY,
      enabled ? '1' : '0',
    );
  } catch {
    // Private mode/storage failures are non-fatal.
  }

  if (!enabled) {
    pendingSound = null;
    stopChannel();
  }

  notifySoundState();
}

export function effectiveAchievementSoundRarity(
  rarity: AchievementSoundRarity,
  kind?: AchievementSoundKind | null,
): AchievementSoundRarity {
  if (kind === 'arc_complete' || kind === 'finale') {
    return 'legendary';
  }

  return rarity;
}

export function prepareAchievementSounds() {
  if (!browserReady()) return;

  const audio = channel();
  if (!audio || audio.src) return;

  audio.src = REVEAL_SOUND;
  audio.load();
}

async function playOnChannel(src: string, priority: number) {
  if (!browserReady() || !achievementSoundsEnabled()) return false;

  const audio = channel();
  if (!audio) return false;

  const now = Date.now();
  const insideCooldown = now - lastPlayedAt < ACHIEVEMENT_SOUND_COOLDOWN_MS;

  if (insideCooldown && priority <= lastPriority) {
    return false;
  }

  stopChannel();
  audio.src = src;
  audio.currentTime = 0;
  audio.volume = ACHIEVEMENT_SOUND_VOLUME;

  try {
    await audio.play();
    soundUnlocked = true;
    pendingSound = null;
    lastPlayedAt = Date.now();
    lastPriority = priority;
    notifySoundState();
    return true;
  } catch (error) {
    if (isAutoplayError(error)) {
      pendingSound = { src, priority };
      soundUnlocked = false;
      notifySoundState();
      return false;
    }

    return false;
  }
}

export async function unlockAchievementSoundsFromGesture() {
  if (!browserReady()) return false;

  setAchievementSoundsEnabled(true);

  const queued = pendingSound;
  const src = queued?.src ?? REVEAL_SOUND;
  const priority = queued?.priority ?? 1;

  const audio = channel();
  if (!audio) return false;

  stopChannel();
  audio.src = src;
  audio.currentTime = 0;
  audio.volume = queued ? ACHIEVEMENT_SOUND_VOLUME : 0.16;

  try {
    await audio.play();
    soundUnlocked = true;
    pendingSound = null;
    lastPlayedAt = Date.now();
    lastPriority = priority;
    notifySoundState();
    return true;
  } catch {
    soundUnlocked = false;
    notifySoundState();
    return false;
  }
}

export async function playAchievementUnlockSound(input: {
  eventId: string;
  rarity: AchievementSoundRarity;
  kind?: AchievementSoundKind | null;
}) {
  if (!input.eventId || playedEventIds.has(input.eventId)) return false;

  rememberPlayedEvent(input.eventId);

  const rarity = effectiveAchievementSoundRarity(input.rarity, input.kind);
  return playOnChannel(SOUND_BY_RARITY[rarity], RARITY_PRIORITY[rarity]);
}

export async function playAchievementRevealSound() {
  return playOnChannel(REVEAL_SOUND, 1);
}
