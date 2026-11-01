export const AVATARS = [
  { id: 'lion', emoji: '🦁' },
  { id: 'panda', emoji: '🐼' },
  { id: 'rabbit', emoji: '🐰' },
  { id: 'cat', emoji: '🐱' },
  { id: 'dog', emoji: '🐶' },
  { id: 'elephant', emoji: '🐘' },
  { id: 'unicorn', emoji: '🦄' },
  { id: 'star', emoji: '⭐' },
] as const;

export const avatarEmoji = (id: string | null) => AVATARS.find((a) => a.id === id)?.emoji ?? '🧩';
