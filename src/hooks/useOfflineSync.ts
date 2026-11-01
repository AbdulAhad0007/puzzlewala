import { useCallback } from 'react';
import { useAppStore } from '../context/useAppStore';
import { syncManager } from '../services/storage/syncManager';

export function useOfflineSync() {
  const status = useAppStore((s) => s.sync);
  const retry = useCallback(() => syncManager.retryNow(), []);
  return { ...status, retry };
}
