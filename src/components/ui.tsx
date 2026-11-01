import { Feather } from '@expo/vector-icons';
import { useRef, type ReactNode } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Switch, Text, View,
  type PressableProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SoundService } from '../services/SoundService';
import { colors, fonts, MIN_TOUCH, radii, shadow, spacing } from '../theme/colors';

type Weight = keyof typeof fonts;

export function Txt({ weight = 'medium', size = 16, color = colors.textDark, style, ...rest }:
  TextProps & { weight?: Weight; size?: number; color?: string }) {
  // Line height is roomy because Devanagari marks sit above and below the line.
  const base: TextStyle = { fontFamily: fonts[weight], fontSize: size, color, lineHeight: size * 1.45 };
  return <Text maxFontSizeMultiplier={1.3} {...rest} style={[base, style]} />;
}

/** A press that always gives sound and touch feedback, so children know it registered. */
export function Tap({ onPress, style, sound = true, children, ...rest }:
  Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; sound?: boolean; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      onPress={(e) => {
        if (sound) SoundService.play('tap');
        SoundService.haptic();
        onPress?.(e);
      }}
      style={({ pressed }) => [style, pressed && { opacity: 0.82, transform: [{ scale: 0.97 }] }]}
    >
      {children}
    </Pressable>
  );
}

const DOUBLE_TAP_MS = 800;

const VARIANTS = {
  yellow: { bg: colors.sunshine, edge: colors.sunshineDark, text: colors.textDark },
  blue: { bg: colors.skyBlue, edge: colors.skyBlueDark, text: colors.textDark },
  pink: { bg: colors.candyPink, edge: colors.candyPinkDark, text: colors.textDark },
  white: { bg: colors.white, edge: colors.locked, text: colors.textDark },
} as const;

export function BigButton({ label, variant = 'yellow', onPress, style, height = 64, size = 20, testID }: {
  label: string; variant?: keyof typeof VARIANTS; onPress: () => void;
  style?: StyleProp<ViewStyle>; height?: number; size?: number; testID?: string;
}) {
  const v = VARIANTS[variant];
  const lastPress = useRef(0);
  return (
    <Tap
      testID={testID}
      onPress={() => {
        // A second tap from an excited finger must not open the next screen twice.
        const now = Date.now();
        if (now - lastPress.current < DOUBLE_TAP_MS) return;
        lastPress.current = now;
        onPress();
      }}
      accessibilityLabel={label}
      style={[styles.big, { backgroundColor: v.bg, borderBottomColor: v.edge, minHeight: height }, style]}
    >
      <Txt weight="black" size={size} color={v.text} style={{ textAlign: 'center' }}>{label}</Txt>
    </Tap>
  );
}

export function RoundButton({ icon, onPress, label, bg = colors.white, color = colors.textDark }: {
  icon: keyof typeof Feather.glyphMap; onPress: () => void; label: string; bg?: string; color?: string;
}) {
  return (
    <Tap onPress={onPress} accessibilityLabel={label} style={[styles.round, { backgroundColor: bg }]}>
      <Feather name={icon} size={26} color={color} />
    </Tap>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ProgressBar({ value, color = colors.mintDark, track = colors.backgroundAlt }: {
  value: number; color?: string; track?: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View
      style={[styles.track, { backgroundColor: track }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: color }]} />
    </View>
  );
}

export function Stars({ count, size = 16 }: { count: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row' }} accessibilityLabel={`${count} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <Text key={i} style={{ fontSize: size, opacity: i <= count ? 1 : 0.22 }}>⭐</Text>
      ))}
    </View>
  );
}

export function Chip({ label, bg, color = colors.textDark }: { label: string; bg: string; color?: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Txt weight="bold" size={14} color={color}>{label}</Txt>
    </View>
  );
}

export function ToggleRow({ label, sub, icon, value, onChange }: {
  label: string; sub?: string; icon?: keyof typeof Feather.glyphMap; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggle}>
      {icon ? (
        <View style={styles.toggleIcon}><Feather name={icon} size={22} color={colors.skyBlueDark} /></View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Txt weight="bold" size={17}>{label}</Txt>
        {sub ? <Txt size={13} color={colors.textMuted}>{sub}</Txt> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={(v) => {
          SoundService.play('tap');
          SoundService.haptic();
          onChange(v);
        }}
        trackColor={{ true: colors.mintDark, false: colors.locked }}
        thumbColor={colors.white}
      />
    </View>
  );
}

/** A row of mutually exclusive choices. Used for language, age, play limit and profile. */
export function Segmented<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segments} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Tap
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={[styles.segment, on && styles.segmentOn]}
          >
            <Txt weight="bold" size={15} color={on ? colors.textDark : colors.textMuted} numberOfLines={1}>{o.label}</Txt>
          </Tap>
        );
      })}
    </View>
  );
}

/** Standard screen frame. `footerSpace` keeps content clear of the floating tab bar. */
export function Screen({ children, scroll = true, footerSpace = 0, edges = ['top', 'left', 'right', 'bottom'] }: {
  children: ReactNode; scroll?: boolean; footerSpace?: number; edges?: ('top' | 'left' | 'right' | 'bottom')[];
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: spacing.xl + footerSpace }]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : children}
    </SafeAreaView>
  );
}

export function Header({ title, sub, onBack }: { title: string; sub?: string; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {onBack ? <RoundButton icon="arrow-left" label="Back" onPress={onBack} /> : null}
      <View style={{ flex: 1 }}>
        <Txt weight="black" size={26} numberOfLines={1} adjustsFontSizeToFit>{title}</Txt>
        {sub ? <Txt size={15} color={colors.textMuted}>{sub}</Txt> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  big: {
    borderRadius: radii.lg, borderBottomWidth: 5, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
  },
  round: {
    width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', ...shadow,
  },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.lg, ...shadow },
  track: { height: 12, borderRadius: radii.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radii.full },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 2, borderRadius: radii.full, alignSelf: 'flex-start' },
  toggle: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH + 8, gap: spacing.md },
  toggleIcon: {
    width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.skyBlueSoft, alignItems: 'center', justifyContent: 'center',
  },
  segments: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.backgroundAlt, borderRadius: radii.lg, padding: spacing.xs },
  segment: {
    flex: 1, minHeight: MIN_TOUCH, borderRadius: radii.md + 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs,
  },
  segmentOn: { backgroundColor: colors.sunshine },
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
