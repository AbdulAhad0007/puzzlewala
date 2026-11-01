import { useEffect } from 'react';
import { AppState } from 'react-native';
import { setImmersive, setPinned } from '../../modules/device-lock';
import { useAppStore } from '../context/useAppStore';

/** Applies this child's Full Screen and pinning choices, and re-applies them on return to the app. */
export function useKioskMode() {
  const fullscreen = useAppStore((s) => s.fullscreen);
  const pinned = useAppStore((s) => s.pinned);

  useEffect(() => {
    const apply = () => {
      setImmersive(fullscreen).catch(() => undefined);
    };
    apply();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') apply();
    });
    return () => sub.remove();
  }, [fullscreen]);

  useEffect(() => {
    setPinned(pinned).catch(() => undefined);
  }, [pinned]);
}
