import { useActiveProfile, useAppStore } from '../context/useAppStore';

export function useChildProfile() {
  const profile = useActiveProfile();
  const profiles = useAppStore((s) => s.profiles);
  const createChild = useAppStore((s) => s.createChild);
  const updateChild = useAppStore((s) => s.updateChild);
  const deleteChild = useAppStore((s) => s.deleteChild);
  const switchProfile = useAppStore((s) => s.switchProfile);
  return { profile, profiles, createChild, updateChild, deleteChild, switchProfile };
}
