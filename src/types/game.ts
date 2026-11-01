export type Language = 'en' | 'hi';
export type PlayLimit = 30 | 45 | 60 | 'none';

export interface Curriculum {
  phonics: boolean;
  hindi: boolean;
  counting: boolean;
}

/** Stored per child and per game in game_settings.settings. */
export interface GameSettings {
  sound_enabled: boolean;
  music_enabled: boolean;
  voice_enabled: boolean;
  learning_language: Language;
  /** Hides Android's status and navigation bars. */
  fullscreen_enabled: boolean;
  /** Android screen pinning, which holds the phone on this app until a person exits it. */
  pinned_enabled: boolean;
  play_limit_minutes: PlayLimit;
  offline_pack: boolean;
  curriculum: Curriculum;
}

export const DEFAULT_SETTINGS: GameSettings = {
  sound_enabled: true,
  music_enabled: true,
  voice_enabled: true,
  learning_language: 'en',
  fullscreen_enabled: false,
  pinned_enabled: false,
  play_limit_minutes: 45,
  offline_pack: true,
  curriculum: { phonics: true, hindi: false, counting: true },
};

export interface GameRecord {
  id: string;
  name: string;
  slug: string;
  status: string;
  version: string | null;
}
