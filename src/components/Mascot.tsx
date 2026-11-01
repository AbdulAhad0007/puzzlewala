import { Image } from 'react-native';

/** The PuzzleWala mascot, cropped from the in-app logo. */
export function Mascot({ size = 64 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/logos/mascot.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityLabel="Mascot"
    />
  );
}
