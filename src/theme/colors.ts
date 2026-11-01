export const colors = {
  skyBlue: '#56B7F5',
  skyBlueDark: '#1F7FC4',
  skyBlueSoft: '#DCF0FE',
  sunshine: '#FFD166',
  sunshineDark: '#E5A92E',
  sunshineSoft: '#FFF4D6',
  candyPink: '#FF8FAB',
  candyPinkDark: '#D94C78',
  candyPinkSoft: '#FFE6ED',
  mint: '#80DFA3',
  mintDark: '#2E9E5B',
  mintSoft: '#E0F8E9',
  lavender: '#B8A2F8',
  lavenderDark: '#7C5CE0',
  lavenderSoft: '#EEE9FE',
  background: '#F8F9FF',
  backgroundAlt: '#EFF4FF',
  card: '#FFFFFF',
  textDark: '#1E293B',
  textMuted: '#475569',
  locked: '#E4EAF4',
  lockedText: '#64748B',
  white: '#FFFFFF',
} as const;

export const radii = { md: 16, lg: 24, xl: 32, full: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Every control a child can touch is at least this tall. */
export const MIN_TOUCH = 56;

export const fonts = {
  regular: 'Baloo2_400Regular',
  medium: 'Baloo2_600SemiBold',
  bold: 'Baloo2_700Bold',
  black: 'Baloo2_800ExtraBold',
} as const;

export const shadow = {
  shadowColor: '#1E293B',
  shadowOpacity: 0.08,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
} as const;
