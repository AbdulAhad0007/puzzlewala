import { useCallback } from 'react';
import { useAppStore } from '../context/useAppStore';
import { strings, type StringKey } from '../i18n/strings';

export function useT() {
  const language = useAppStore((s) => s.language);
  return useCallback((key: StringKey) => strings[language][key], [language]);
}
