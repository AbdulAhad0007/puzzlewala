import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

export type SoundName = 'tap' | 'snap' | 'chime' | 'oops' | 'star' | 'victory';

/** The device-facing half of sound. Swap it out in tests with `SoundService.useBackend`. */
export interface AudioBackend {
  init(): Promise<void>;
  playEffect(name: SoundName): void;
  setMusicPlaying(playing: boolean): void;
  speak(text: string, language: string): void;
  stopSpeaking(): void;
  haptic(kind: 'light' | 'success'): void;
}

const SOURCES: Record<SoundName | 'music', number> = {
  tap: require('../../assets/audio/tap.wav'),
  snap: require('../../assets/audio/snap.wav'),
  chime: require('../../assets/audio/chime.wav'),
  oops: require('../../assets/audio/oops.wav'),
  star: require('../../assets/audio/star.wav'),
  victory: require('../../assets/audio/victory.wav'),
  music: require('../../assets/audio/music.wav'),
};

const players = new Map<string, AudioPlayer>();

function player(name: SoundName | 'music'): AudioPlayer {
  let p = players.get(name);
  if (!p) {
    p = createAudioPlayer(SOURCES[name]);
    if (name === 'music') {
      p.loop = true;
      p.volume = 0.25;
    }
    players.set(name, p);
  }
  return p;
}

// Sound must never be able to crash a child's game, so device errors are dropped here.
const safely = (fn: () => unknown) => {
  try {
    const result = fn();
    if (result instanceof Promise) result.catch(() => undefined);
  } catch {
    /* no audio on this device */
  }
};

export const expoBackend: AudioBackend = {
  async init() {
    safely(() => setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }));
  },
  playEffect(name) {
    safely(() => {
      const p = player(name);
      safely(() => p.seekTo(0));
      p.play();
    });
  },
  setMusicPlaying(playing) {
    safely(() => (playing ? player('music').play() : players.get('music')?.pause()));
  },
  speak(text, language) {
    safely(() => {
      Speech.stop();
      Speech.speak(text, { language, rate: 0.85, pitch: 1.1 });
    });
  },
  stopSpeaking() {
    safely(() => Speech.stop());
  },
  haptic(kind) {
    safely(() =>
      kind === 'success'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
    );
  },
};
