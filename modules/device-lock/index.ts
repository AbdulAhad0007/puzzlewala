import { requireOptionalNativeModule } from 'expo';

interface DeviceLockNative {
  isLockAllowed(): boolean;
  requestLockPermission(explanation: string): void;
  removeLockPermission(): void;
  lockPhone(): boolean;
  closeApp(): Promise<void>;
  setImmersive(enabled: boolean): Promise<void>;
  setPinned(enabled: boolean): Promise<void>;
}

// Missing in Expo Go and the browser build. Everything below then safely does nothing.
const native = requireOptionalNativeModule<DeviceLockNative>('DeviceLock');

export const isDeviceLockAvailable = native !== null;
export const isLockAllowed = () => native?.isLockAllowed() ?? false;
export const requestLockPermission = (explanation: string) => native?.requestLockPermission(explanation);
export const removeLockPermission = () => native?.removeLockPermission();
export const setImmersive = async (enabled: boolean) => { await native?.setImmersive(enabled); };
export const setPinned = async (enabled: boolean) => { await native?.setPinned(enabled); };

/** Ends play: unpins, locks the phone if a parent allowed it, and closes the app. */
export async function endPlaySession(): Promise<{ locked: boolean }> {
  if (!native) return { locked: false };
  await native.setPinned(false).catch(() => undefined);
  const locked = native.lockPhone();
  await native.closeApp();
  return { locked };
}
