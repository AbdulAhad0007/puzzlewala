import { memo, useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { colors } from '../theme/colors';

const PALETTE = [colors.skyBlue, colors.sunshine, colors.candyPink, colors.mint, colors.lavender];
const COUNT = 48;

interface Bit { x: number; drift: number; delay: number; duration: number; spin: number; color: string; size: number; round: boolean }

function ConfettiBit({ bit, height }: { bit: Bit; height: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(bit.delay, withTiming(1, { duration: bit.duration, easing: Easing.in(Easing.quad) }));
  }, [bit, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value > 0.9 ? (1 - t.value) * 10 : 1,
    transform: [
      { translateX: bit.x + bit.drift * t.value },
      { translateY: -30 + (height + 60) * t.value },
      { rotate: `${bit.spin * t.value}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[styles.bit, {
        width: bit.size, height: bit.round ? bit.size : bit.size * 1.6, backgroundColor: bit.color,
        borderRadius: bit.round ? bit.size / 2 : 2,
      }, style]}
    />
  );
}

export const Confetti = memo(function Confetti() {
  const { width, height } = useWindowDimensions();
  const [bits] = useState<Bit[]>(() => Array.from({ length: COUNT }, (_, i) => ({
    x: Math.random() * width,
    drift: (Math.random() - 0.5) * 120,
    delay: Math.random() * 700,
    duration: 1800 + Math.random() * 1400,
    spin: 360 + Math.random() * 720,
    color: PALETTE[i % PALETTE.length],
    size: 8 + Math.random() * 7,
    round: i % 3 === 0,
  })));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {bits.map((bit, i) => <ConfettiBit key={i} bit={bit} height={height} />)}
    </View>
  );
});

const styles = StyleSheet.create({ bit: { position: 'absolute', left: 0, top: 0 } });
