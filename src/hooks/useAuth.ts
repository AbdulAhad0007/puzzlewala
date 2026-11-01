import { useAppStore } from '../context/useAppStore';

/** Whether this installation's identity is working, from the point of view of the UI. */
export function useAuth() {
  const state = useAppStore((s) => s.sync.state);
  return {
    isCloudReady: state === 'idle' || state === 'syncing' || state === 'error',
    isLocalOnly: state === 'local-only',
    signInUnavailable: state === 'sign-in-unavailable',
  };
}
