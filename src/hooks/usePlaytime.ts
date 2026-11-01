import { useEffect } from 'react';
import { AppState } from 'react-native';
import { isOverPlayLimit, useActiveProfile, useAppStore } from '../context/useAppStore';
import { SoundService } from '../services/SoundService';

const TICK_SECONDS = 10;

/** Counts time while the app is on screen, and pauses audio when it is not. */
export function usePlaytimeTracker() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => SoundService.setForeground(state === 'active'));
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') useAppStore.getState().addPlaySeconds(TICK_SECONDS);
    }, TICK_SECONDS * 1000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);
}

export function useIsOverPlayLimit() {
  const profile = useActiveProfile();
  const limit = useAppStore((s) => s.playLimit);
  return isOverPlayLimit(profile, limit);
}
