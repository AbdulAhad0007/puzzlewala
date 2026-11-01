import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useT } from '../hooks/useT';
import { colors, MIN_TOUCH, radii, spacing } from '../theme/colors';
import { makeQuestion } from '../utils/mathGate';
import { BigButton, Tap, Txt } from './ui';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'] as const;

export function ParentMathGate({ visible, onPass, onCancel }: {
  visible: boolean; onPass: () => void; onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* Mounted only while open, so each opening gets a fresh question a child can't memorise. */}
      {visible ? <GateBody onPass={onPass} onCancel={onCancel} /> : null}
    </Modal>
  );
}

function GateBody({ onPass, onCancel }: { onPass: () => void; onCancel: () => void }) {
  const t = useT();
  const [question, setQuestion] = useState(makeQuestion);
  const [entry, setEntry] = useState('');
  const [wrong, setWrong] = useState(false);

  const press = (key: (typeof KEYS)[number]) => {
    if (key === 'del') return setEntry((e) => e.slice(0, -1));
    if (key !== 'ok') {
      setWrong(false);
      return setEntry((e) => (e.length < 2 ? e + key : e));
    }
    if (!entry) return;
    if (Number(entry) === question.answer) return onPass();
    setWrong(true);
    setEntry('');
    setQuestion(makeQuestion());
  };

  return (
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel={t('cancel')}>
        <Pressable style={styles.sheet} onPress={() => undefined} accessible={false}>
          <Txt weight="black" size={24} style={styles.center}>{t('gateTitle')}</Txt>
          <Txt size={15} color={wrong ? colors.candyPinkDark : colors.textMuted} style={styles.center}>
            {wrong ? t('gateRetry') : t('gateSub')}
          </Txt>
          <Txt testID="gate-question" weight="black" size={38} style={styles.center}>{question.text}</Txt>
          <View style={styles.display}>
            <Txt testID="gate-entry" weight="black" size={30}>{entry || ' '}</Txt>
          </View>
          <View style={styles.pad}>
            {KEYS.map((key) => (
              <Tap
                key={key}
                onPress={() => press(key)}
                testID={`key-${key}`}
                accessibilityLabel={key === 'del' ? 'Delete' : key === 'ok' ? t('gateCheck') : key}
                style={[styles.key, key === 'ok' && { backgroundColor: colors.mint }]}
              >
                {key === 'del' ? <Feather name="delete" size={26} color={colors.textDark} />
                  : key === 'ok' ? <Feather name="check" size={28} color={colors.textDark} />
                    : <Txt weight="black" size={26}>{key}</Txt>}
              </Tap>
            ))}
          </View>
          <BigButton label={t('cancel')} variant="white" height={MIN_TOUCH} size={17} onPress={onCancel} />
        </Pressable>
      </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(30,41,59,0.55)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  sheet: { width: '100%', maxWidth: 380, backgroundColor: colors.card, borderRadius: radii.xl, padding: spacing.xl, gap: spacing.sm },
  center: { textAlign: 'center' },
  display: { minHeight: MIN_TOUCH, backgroundColor: colors.backgroundAlt, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm, marginBottom: spacing.xs },
  key: { width: '31.5%', height: MIN_TOUCH, borderRadius: radii.md, backgroundColor: colors.skyBlueSoft, alignItems: 'center', justifyContent: 'center' },
});
