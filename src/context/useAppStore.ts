import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { isCloudConfigured } from '../constants/gameConfig';
import { earnedBadgeIds, getPuzzle, type SolvedMap } from '../data/puzzles';
import * as repo from '../services/gameRepository';
import { SoundService } from '../services/SoundService';
import { syncManager, type SyncStatus } from '../services/storage/syncManager';
import { DEFAULT_SETTINGS, type Curriculum, type GameSettings, type Language, type PlayLimit } from '../types/game';
import type { AgeGroup, ChildProfileInput, ChildProfileRecord, Gender } from '../types/profile';
import type { PuzzleSessionData } from '../types/progress';
import type { AgeTier } from '../utils/jigsaw';

export type { Language, PlayLimit, Curriculum };

export interface DayStats { date: string; seconds: number; solved: number; questClaimed: boolean; bonusMinutes: number }

/** Device-only daily counters. They drive the play limit, which belongs to this device. */
export interface DailyState { streak: number; lastPlayDate: string | null; today: DayStats }

export interface Profile extends DailyState {
  id: string;
  displayId: string;
  name: string;
  gender: Gender | null;
  ageGroup: AgeGroup | null;
  avatarId: string | null;
  ageTier: AgeTier;
  curriculum: Curriculum;
  settings: GameSettings;
  solved: SolvedMap;
  coins: number;
  session: PuzzleSessionData | null;
}

export interface CompletionResult { stars: number; coins: number; newBadgeId?: string }

export const QUEST_GOAL = 3;
export const QUEST_REWARD = 30;
export const FIRST_SOLVE_COINS = 50;
export const REPLAY_COINS = 10;
export const BONUS_MINUTES = 15;

const PULL_WAIT_MS = 3000;

export const dateKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const freshDay = (date: string): DayStats => ({ date, seconds: 0, solved: 0, questClaimed: false, bonusMinutes: 0 });
const freshDaily = (): DailyState => ({ streak: 0, lastPlayDate: null, today: freshDay(dateKey()) });
const dayOf = (p: DailyState, date: string) => (p.today.date === date ? p.today : freshDay(date));

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** Age group sets puzzle difficulty, see difficultyFor. */
export const tierForAgeGroup = (group: AgeGroup | null): AgeTier =>
  group === '3-4' ? 3 : group === '5-6' ? 5 : 4;

const EMPTY_PROFILE: Profile = {
  id: '', displayId: '', name: '', gender: null, ageGroup: null, avatarId: null, ageTier: 4,
  curriculum: DEFAULT_SETTINGS.curriculum, settings: DEFAULT_SETTINGS, solved: {}, coins: 0, session: null,
  ...freshDaily(),
};

function buildProfile(record: ChildProfileRecord, state: repo.ChildGameState, daily: DailyState | undefined): Profile {
  return {
    id: record.id,
    displayId: record.displayId,
    name: record.nickname,
    gender: record.gender,
    ageGroup: record.ageGroup,
    avatarId: record.avatarId,
    ageTier: tierForAgeGroup(record.ageGroup),
    curriculum: state.settings.curriculum,
    settings: state.settings,
    solved: state.solved,
    coins: state.coins,
    session: state.session,
    ...(daily ?? freshDaily()),
  };
}

const prefsFrom = (s: GameSettings) => ({
  sfx: s.sound_enabled,
  music: s.music_enabled,
  voice: s.voice_enabled,
  language: s.learning_language,
  fullscreen: s.fullscreen_enabled,
  pinned: s.pinned_enabled,
  playLimit: s.play_limit_minutes,
  offlinePack: s.offline_pack,
});

type Prefs = ReturnType<typeof prefsFrom>;

const PREF_FIELD: { [K in keyof Prefs]: keyof GameSettings } = {
  sfx: 'sound_enabled',
  music: 'music_enabled',
  voice: 'voice_enabled',
  language: 'learning_language',
  fullscreen: 'fullscreen_enabled',
  pinned: 'pinned_enabled',
  playLimit: 'play_limit_minutes',
  offlinePack: 'offline_pack',
};

// Local writes are fast and shouldn't hold up the child, but a failure must not vanish silently.
const inBackground = (work: Promise<unknown>) => {
  work.catch((e) => console.error('Could not save locally:', e));
};

export interface AppState extends Prefs {
  /** False until profiles are loaded from local storage. */
  loaded: boolean;
  activeProfileId: string | null;
  profiles: Record<string, Profile>;
  daily: Record<string, DailyState>;
  sync: SyncStatus;

  bootstrap: () => Promise<void>;
  reloadFromLocal: () => Promise<void>;
  createChild: (input: ChildProfileInput) => Promise<Profile>;
  updateChild: (id: string, input: ChildProfileInput) => Promise<void>;
  deleteChild: (id: string) => Promise<void>;
  switchProfile: (id: string) => void;
  setPref: (patch: Partial<Prefs>) => void;
  setCurriculum: (patch: Partial<Curriculum>) => void;
  completePuzzle: (puzzleId: string, stars: number, now?: Date) => CompletionResult;
  savePuzzleSession: (data: PuzzleSessionData) => void;
  addPlaySeconds: (seconds: number, now?: Date) => void;
  grantBonusTime: (now?: Date) => void;
  resetProgress: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const patchProfile = (id: string, patch: Partial<Profile>) =>
        set((s) => (s.profiles[id] ? { profiles: { ...s.profiles, [id]: { ...s.profiles[id], ...patch } } } : {}));

      const patchDaily = (id: string, daily: DailyState) => {
        patchProfile(id, daily);
        set((s) => ({ daily: { ...s.daily, [id]: daily } }));
      };

      const activeProfile = () => {
        const { activeProfileId, profiles } = get();
        return activeProfileId ? profiles[activeProfileId] : undefined;
      };

      const writeSettings = (p: Profile, settings: GameSettings) => {
        patchProfile(p.id, { settings, curriculum: settings.curriculum });
        inBackground(repo.saveSettings(p.id, settings));
      };

      return {
        ...prefsFrom(DEFAULT_SETTINGS),
        loaded: false,
        activeProfileId: null,
        profiles: {},
        daily: {},
        sync: syncManager.getStatus(),

        // Local data is enough to run the app. Only a device with no profiles at all briefly
        // waits for the cloud, in case it has this installation's children.
        bootstrap: async () => {
          syncManager.subscribe((sync) => set({ sync }));
          syncManager.onDataChanged(() => inBackground(get().reloadFromLocal()));
          await repo.adoptLocalGameRows();
          syncManager.start();
          await get().reloadFromLocal();
          if (Object.keys(get().profiles).length === 0 && isCloudConfigured) {
            await Promise.race([
              syncManager.flush(),
              new Promise((resolve) => setTimeout(resolve, PULL_WAIT_MS)),
            ]);
            await get().reloadFromLocal();
          }
          set({ loaded: true });
        },

        reloadFromLocal: async () => {
          const records = await repo.listProfiles();
          const { daily, activeProfileId } = get();
          const profiles: Record<string, Profile> = {};
          for (const record of records) {
            profiles[record.id] = buildProfile(record, await repo.loadChildState(record.id), daily[record.id]);
          }
          const activeId = activeProfileId && profiles[activeProfileId] ? activeProfileId : (records[0]?.id ?? null);
          set({
            profiles,
            activeProfileId: activeId,
            ...prefsFrom(activeId ? profiles[activeId].settings : DEFAULT_SETTINGS),
          });
        },

        createChild: async (input) => {
          const record = await repo.createProfile(input);
          await repo.saveSettings(record.id, DEFAULT_SETTINGS);
          const profile = buildProfile(record, await repo.loadChildState(record.id), undefined);
          set((s) => ({
            profiles: { ...s.profiles, [record.id]: profile },
            activeProfileId: record.id,
            ...prefsFrom(profile.settings),
          }));
          return profile;
        },

        updateChild: async (id, input) => {
          const record = await repo.updateProfile(id, input);
          patchProfile(id, {
            name: record.nickname,
            gender: record.gender,
            ageGroup: record.ageGroup,
            avatarId: record.avatarId,
            ageTier: tierForAgeGroup(record.ageGroup),
          });
        },

        deleteChild: async (id) => {
          await repo.deleteProfile(id);
          set((s) => {
            const { [id]: _removedDaily, ...daily } = s.daily;
            return { daily, activeProfileId: s.activeProfileId === id ? null : s.activeProfileId };
          });
          await get().reloadFromLocal();
        },

        switchProfile: (id) => {
          const profile = get().profiles[id];
          if (profile) set({ activeProfileId: id, ...prefsFrom(profile.settings) });
        },

        setPref: (patch) => {
          set(patch);
          const p = activeProfile();
          if (!p) return;
          const settings = { ...p.settings };
          for (const key of Object.keys(patch) as (keyof Prefs)[]) {
            (settings as Record<string, unknown>)[PREF_FIELD[key]] = patch[key];
          }
          writeSettings(p, settings);
        },

        setCurriculum: (patch) => {
          const p = activeProfile();
          if (p) writeSettings(p, { ...p.settings, curriculum: { ...p.settings.curriculum, ...patch } });
        },

        completePuzzle: (puzzleId, stars, now = new Date()) => {
          const p = activeProfile();
          if (!p) return { stars, coins: 0 };
          const date = dateKey(now);
          const earned = p.solved[puzzleId] ? REPLAY_COINS : FIRST_SOLVE_COINS;
          const solved = { ...p.solved, [puzzleId]: Math.max(p.solved[puzzleId] ?? 0, stars) };

          const before = new Set(earnedBadgeIds(p.solved));
          const newBadgeId = earnedBadgeIds(solved).find((id) => !before.has(id));

          const day = dayOf(p, date);
          const solvedToday = day.solved + 1;
          const questDone = !day.questClaimed && solvedToday >= QUEST_GOAL;
          const bonus = questDone ? QUEST_REWARD : 0;

          let streak = p.streak;
          if (p.lastPlayDate !== date) {
            streak = p.lastPlayDate && daysBetween(p.lastPlayDate, date) === 1 ? p.streak + 1 : 1;
          }

          patchProfile(p.id, { solved, coins: p.coins + earned + bonus, session: null });
          patchDaily(p.id, {
            streak,
            lastPlayDate: date,
            today: { ...day, solved: solvedToday, questClaimed: day.questClaimed || questDone },
          });
          inBackground(repo.recordCompletion({
            childId: p.id,
            category: getPuzzle(puzzleId).setId,
            levelId: puzzleId,
            stars,
            coins: earned,
            questBonus: bonus,
            badgeId: newBadgeId,
          }));
          return { stars, coins: earned, newBadgeId };
        },

        savePuzzleSession: (data) => {
          const p = activeProfile();
          if (!p) return;
          patchProfile(p.id, { session: data });
          inBackground(repo.saveSession(p.id, data));
        },

        addPlaySeconds: (seconds, now = new Date()) => {
          const p = activeProfile();
          if (!p) return;
          const day = dayOf(p, dateKey(now));
          patchDaily(p.id, { streak: p.streak, lastPlayDate: p.lastPlayDate, today: { ...day, seconds: day.seconds + seconds } });
        },

        grantBonusTime: (now = new Date()) => {
          const p = activeProfile();
          if (!p) return;
          const day = dayOf(p, dateKey(now));
          patchDaily(p.id, {
            streak: p.streak,
            lastPlayDate: p.lastPlayDate,
            today: { ...day, bonusMinutes: day.bonusMinutes + BONUS_MINUTES },
          });
        },

        resetProgress: () => {
          const p = activeProfile();
          if (!p) return;
          patchProfile(p.id, { solved: {}, coins: 0, session: null });
          patchDaily(p.id, freshDaily());
          inBackground(repo.resetGameProgress(p.id));
        },
      };
    },
    {
      // A new key: Phase 1's demo-profile data stays on disk untouched and unread.
      name: 'puzzlewala-device-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ activeProfileId, daily }) => ({ activeProfileId, daily }),
    },
  ),
);

export const useActiveProfile = () =>
  useAppStore((s) => (s.activeProfileId ? s.profiles[s.activeProfileId] : undefined) ?? EMPTY_PROFILE);

export function isOverPlayLimit(p: DailyState, limit: PlayLimit, now: Date = new Date()): boolean {
  if (limit === 'none') return false;
  const day = dayOf(p, dateKey(now));
  return day.seconds >= (limit + day.bonusMinutes) * 60;
}

const syncSound = ({ sfx, music, voice }: AppState) => SoundService.applyPrefs({ sfx, music, voice });
useAppStore.subscribe(syncSound);
useAppStore.persist.onFinishHydration(syncSound);
