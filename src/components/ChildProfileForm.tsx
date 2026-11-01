import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { AVATARS } from '../data/avatars';
import { useT } from '../hooks/useT';
import { colors, fonts, MIN_TOUCH, radii, spacing } from '../theme/colors';
import type { AgeGroup, ChildProfileInput, Gender } from '../types/profile';
import { BigButton, Card, Segmented, Tap, Txt } from './ui';

const NICKNAME_MAX = 30;
const AGE_GROUPS: { value: AgeGroup; label: string }[] = [
  { value: '3-4', label: '3–4' },
  { value: '4-5', label: '4–5' },
  { value: '5-6', label: '5–6' },
];

/** Asks for the least we need: a nickname and an age group. Everything else is optional. */
export function ChildProfileForm({ initial, submitLabel, onSubmit }: {
  initial?: ChildProfileInput;
  submitLabel: string;
  onSubmit: (input: ChildProfileInput) => Promise<void>;
}) {
  const t = useT();
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [ageGroup, setAgeGroup] = useState<AgeGroup | ''>(initial?.ageGroup ?? '');
  const [gender, setGender] = useState<Gender | ''>(initial?.gender ?? '');
  const [avatarId, setAvatarId] = useState<string | null>(initial?.avatarId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const trimmed = nickname.trim();
    if (!trimmed) return setError(t('nicknameRequired'));
    if (!ageGroup) return setError(t('ageRequired'));
    setError(null);
    setSaving(true);
    try {
      await onSubmit({ nickname: trimmed, ageGroup, gender: gender || null, avatarId });
    } catch {
      setError(t('saveFailed'));
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.sm }}>
        <Txt weight="black" size={18}>{t('nickname')}</Txt>
        <TextInput
          testID="nickname"
          value={nickname}
          onChangeText={(v) => { setNickname(v); setError(null); }}
          maxLength={NICKNAME_MAX}
          placeholder={t('nicknamePlaceholder')}
          placeholderTextColor={colors.lockedText}
          accessibilityLabel={t('nickname')}
          autoCorrect={false}
          style={styles.input}
        />
        <Txt size={13} color={colors.textMuted}>{t('nicknameHelp')}</Txt>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Txt weight="black" size={18}>{t('ageGroup')}</Txt>
        <Segmented<AgeGroup | ''> options={AGE_GROUPS} value={ageGroup} onChange={(v) => { setAgeGroup(v); setError(null); }} />
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Txt weight="black" size={18}>{t('chooseAvatar')}</Txt>
        <View style={styles.avatars}>
          {AVATARS.map((a) => {
            const on = a.id === avatarId;
            return (
              <Tap
                key={a.id}
                testID={`avatar-${a.id}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={a.id}
                onPress={() => setAvatarId(on ? null : a.id)}
                style={[styles.avatar, on && styles.avatarOn]}
              >
                <Text style={styles.avatarEmoji}>{a.emoji}</Text>
              </Tap>
            );
          })}
        </View>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Txt weight="black" size={18}>{t('genderOptional')}</Txt>
        <Segmented<Gender | ''>
          options={[
            { value: '', label: t('skip') },
            { value: 'girl', label: t('girl') },
            { value: 'boy', label: t('boy') },
            { value: 'other', label: t('otherGender') },
          ]}
          value={gender}
          onChange={setGender}
        />
      </Card>

      {error ? <Txt testID="form-error" weight="bold" size={15} color={colors.candyPinkDark} style={styles.center}>{error}</Txt> : null}
      <BigButton testID="profile-submit" label={submitLabel} height={68} onPress={() => { if (!saving) void submit(); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: MIN_TOUCH, borderRadius: radii.md, backgroundColor: colors.backgroundAlt, paddingHorizontal: spacing.lg,
    fontFamily: fonts.bold, fontSize: 20, color: colors.textDark,
  },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm },
  avatar: {
    width: '23%', aspectRatio: 1, minHeight: MIN_TOUCH, borderRadius: radii.md, backgroundColor: colors.backgroundAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarOn: { backgroundColor: colors.sunshine, borderWidth: 3, borderColor: colors.sunshineDark },
  avatarEmoji: { fontSize: 34, lineHeight: 44 },
  center: { textAlign: 'center' },
});
