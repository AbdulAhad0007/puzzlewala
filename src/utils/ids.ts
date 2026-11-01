import * as Crypto from 'expo-crypto';
import { gameConfig } from '../constants/gameConfig';

// 32 symbols without the look-alikes 0/O and 1/I. 256 mod 32 = 0, so each is equally likely.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const newUuid = () => Crypto.randomUUID();

/**
 * Proposes a Child ID so a profile is complete even when created offline.
 * The database re-issues it in the rare case of a collision, and the app adopts that value.
 */
export function newDisplayId(prefix: string = gameConfig.displayIdPrefix): string {
  const bytes = Crypto.getRandomBytes(6);
  return `${prefix}-${Array.from(bytes, (b) => ALPHABET[b % 32]).join('')}`;
}
