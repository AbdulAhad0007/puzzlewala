import { expoBackend, type AudioBackend, type SoundName } from './audioBackend';

export interface SoundPrefs { sfx: boolean; music: boolean; voice: boolean }

class SoundServiceImpl {
  private backend: AudioBackend = expoBackend;
  private prefs: SoundPrefs = { sfx: true, music: true, voice: true };
  private foreground = true;
  private unlocked = false;

  useBackend(backend: AudioBackend) {
    this.backend = backend;
  }

  /** Browsers and some devices need a first tap before audio may start. */
  async unlock() {
    await this.backend.init();
    this.unlocked = true;
    this.syncMusic();
  }

  /** The store calls this on load and on every change, so toggles persist across launches. */
  applyPrefs(prefs: SoundPrefs) {
    if (!prefs.voice && this.prefs.voice) this.backend.stopSpeaking();
    this.prefs = prefs;
    this.syncMusic();
  }

  setForeground(foreground: boolean) {
    this.foreground = foreground;
    if (!foreground) this.backend.stopSpeaking();
    this.syncMusic();
  }

  play(name: SoundName) {
    if (this.prefs.sfx) this.backend.playEffect(name);
  }

  /** Spoken instruction: respects the Voice Instructions toggle. */
  instruct(text: string, language: string) {
    if (this.prefs.voice) this.backend.speak(text, language);
  }

  /** The child pressed a speaker button, so this always speaks. */
  pronounce(text: string, language: string) {
    this.backend.speak(text, language);
  }

  stopSpeaking() {
    this.backend.stopSpeaking();
  }

  /** Haptics stay on regardless of sound: they work when the phone must stay quiet. */
  haptic(kind: 'light' | 'success' = 'light') {
    this.backend.haptic(kind);
  }

  private syncMusic() {
    if (this.unlocked) this.backend.setMusicPlaying(this.prefs.music && this.foreground);
  }
}

export const SoundService = new SoundServiceImpl();
