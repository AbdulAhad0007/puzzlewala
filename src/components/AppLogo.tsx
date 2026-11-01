import { Image } from 'react-native';

// Width over height of assets/logos/inside-logo.png, so the logo never distorts.
const ASPECT_RATIO = 900 / 169;

/** The small logo used at the top of the app's main screens. */
export function AppLogo({ height = 34 }: { height?: number }) {
  return (
    <Image
      source={require('../../assets/logos/inside-logo.png')}
      style={{ height, width: height * ASPECT_RATIO, alignSelf: 'flex-start' }}
      resizeMode="contain"
      accessibilityLabel="PuzzleWala"
    />
  );
}
