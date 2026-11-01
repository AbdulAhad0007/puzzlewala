import { useActiveProfile, useAppStore } from '../context/useAppStore';

export function useGameSettings() {
  const { settings } = useActiveProfile();
  const setPref = useAppStore((s) => s.setPref);
  const setCurriculum = useAppStore((s) => s.setCurriculum);
  return { settings, setPref, setCurriculum };
}
