import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Modal, StyleSheet, Text, View } from 'react-native';
import {
  isDeviceLockAvailable, isLockAllowed, removeLockPermission, requestLockPermission,
} from '../../modules/device-lock';
import { BigButton, Card, Header, ProgressBar, Screen, Segmented, ToggleRow, Txt } from '../components/ui';
import { dateKey, useActiveProfile, useAppStore, type Language, type PlayLimit } from '../context/useAppStore';
import { avatarEmoji } from '../data/avatars';
import { countStars, PICTURE_WORLDS, SETS, solvedCount, type SetId } from '../data/puzzles';
import { useT } from '../hooks/useT';
import type { StringKey } from '../i18n/strings';
import type { RootProps } from '../navigation/types';
import { syncManager, type SyncState } from '../services/storage/syncManager';
import { colors, MIN_TOUCH, radii, spacing } from '../theme/colors';

const SYNC_LABEL: Record<SyncState, StringKey> = {
  'local-only': 'syncLocalOnly',
  idle: 'syncIdle',
  syncing: 'syncSyncing',
  offline: 'syncOffline',
  'sign-in-unavailable': 'syncUnavailable',
  error: 'syncError',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card style={{ gap: spacing.sm }}>
      <Txt weight="black" size={18}>{title}</Txt>
      {children}
    </Card>
  );
}

function ConfirmDialog({ visible, title, body, confirmLabel, onCancel, onConfirm, confirmTestID }: {
  visible: boolean; title: string; body: string; confirmLabel: string;
  onCancel: () => void; onConfirm: () => void; confirmTestID: string;
}) {
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Txt weight="black" size={24}>{title}</Txt>
          <Txt size={16} color={colors.textMuted}>{body}</Txt>
          <BigButton label={t('cancel')} variant="white" height={MIN_TOUCH} size={17} onPress={onCancel} />
          <BigButton testID={confirmTestID} label={confirmLabel} variant="pink" height={MIN_TOUCH} size={17} onPress={onConfirm} />
        </View>
      </View>
    </Modal>
  );
}

export function ParentZoneScreen({ navigation }: RootProps<'ParentZone'>) {
  const t = useT();
  const profile = useActiveProfile();
  const store = useAppStore();
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null);
  const [lockAllowed, setLockAllowed] = useState(isLockAllowed);

  // Android's consent screen is separate, so re-check when the parent comes back from it.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setLockAllowed(isLockAllowed());
    });
    return () => sub.remove();
  }, []);

  const { solved, curriculum, settings } = profile;
  const minutesToday = profile.today.date === dateKey() ? Math.floor(profile.today.seconds / 60) : 0;

  const share = (ids: SetId[]) => {
    const total = ids.reduce((sum, id) => sum + SETS[id].puzzles.length, 0);
    return ids.reduce((sum, id) => sum + solvedCount(id, solved), 0) / total;
  };
  const mastery: { label: StringKey; value: number; color: string }[] = [
    { label: 'englishPhonics', value: share(['alphabet', 'words']), color: colors.skyBlueDark },
    ...(curriculum.hindi ? [{ label: 'hindiAksharmala' as StringKey, value: share(['hindi']), color: colors.candyPinkDark }] : []),
    { label: 'numberCounting', value: share(['numbers']), color: colors.sunshineDark },
    { label: 'masteryVocab', value: share(['animals', 'fruits']), color: colors.mintDark },
    { label: 'masteryShapes', value: share(PICTURE_WORLDS.filter((id) => id === 'shapes' || id === 'colors')), color: colors.lavenderDark },
  ];

  const { sync } = store;

  return (
    <Screen>
      <Header title={t('parentZone')} onBack={navigation.goBack} />

      <Section title={t('childProfile')}>
        <Segmented
          options={Object.values(store.profiles).map((p) => ({ value: p.id, label: p.name }))}
          value={store.activeProfileId ?? ''}
          onChange={store.switchProfile}
        />
        <View style={styles.childRow}>
          <Text style={styles.childAvatar}>{avatarEmoji(profile.avatarId)}</Text>
          <View style={{ flex: 1 }}>
            <Txt weight="black" size={19} numberOfLines={1}>{profile.name}</Txt>
            <Txt testID="parent-child-id" size={14} color={colors.textMuted}>{t('childId')}: {profile.displayId}</Txt>
            <Txt size={14} color={colors.textMuted}>{t('ageGroup')}: {profile.ageGroup?.replace('-', '–')}</Txt>
          </View>
        </View>
        <BigButton
          testID="edit-child"
          label={t('editChild')}
          variant="blue"
          height={MIN_TOUCH}
          size={16}
          onPress={() => navigation.navigate('ChildProfile', { mode: 'edit', childId: profile.id })}
        />
        <BigButton
          testID="add-child"
          label={t('addChild')}
          height={MIN_TOUCH}
          size={16}
          onPress={() => navigation.navigate('ChildProfile', { mode: 'create' })}
        />
      </Section>

      <Section title={t('gameSettings')}>
        <Txt weight="bold" size={15}>{t('language')}</Txt>
        <Segmented<Language>
          options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिंदी' }]}
          value={store.language}
          onChange={(language) => store.setPref({ language })}
        />
        <ToggleRow label={t('soundEffects')} value={store.sfx} onChange={(sfx) => store.setPref({ sfx })} />
        <ToggleRow label={t('backgroundMusic')} value={store.music} onChange={(music) => store.setPref({ music })} />
        <ToggleRow
          label={t('fullscreen')}
          sub={t('fullscreenSub')}
          value={settings.fullscreen_enabled}
          onChange={(fullscreen) => store.setPref({ fullscreen })}
        />
        {isDeviceLockAvailable ? (
          <ToggleRow
            label={t('pinApp')}
            sub={t('pinAppSub')}
            value={store.pinned}
            onChange={(pinned) => store.setPref({ pinned })}
          />
        ) : null}
      </Section>

      <Section title={t('curriculum')}>
        <ToggleRow label={t('englishPhonics')} value={curriculum.phonics} onChange={(v) => store.setCurriculum({ phonics: v })} />
        <ToggleRow label={t('hindiAksharmala')} value={curriculum.hindi} onChange={(v) => store.setCurriculum({ hindi: v })} />
        <ToggleRow label={t('numberCounting')} value={curriculum.counting} onChange={(v) => store.setCurriculum({ counting: v })} />
      </Section>

      <View style={styles.stats}>
        {[
          { label: t('statsDone'), value: String(Object.keys(solved).length), bg: colors.skyBlueSoft },
          { label: t('statsStars'), value: String(countStars(solved)), bg: colors.sunshineSoft },
          {
            label: t('statsToday'),
            value: store.playLimit === 'none' ? `${minutesToday}m` : `${minutesToday} / ${store.playLimit}m`,
            bg: colors.mintSoft,
          },
        ].map((s) => (
          <View key={s.label} style={[styles.stat, { backgroundColor: s.bg }]}>
            <Txt weight="black" size={21} numberOfLines={1} adjustsFontSizeToFit>{s.value}</Txt>
            <Txt size={12} color={colors.textMuted} style={{ textAlign: 'center' }}>{s.label}</Txt>
          </View>
        ))}
      </View>

      <Section title={t('mastery')}>
        {mastery.map((m) => (
          <View key={m.label} style={{ gap: 2 }}>
            <View style={styles.masteryRow}>
              <Txt size={14}>{t(m.label)}</Txt>
              <Txt weight="bold" size={14}>{Math.round(m.value * 100)}%</Txt>
            </View>
            <ProgressBar value={m.value} color={m.color} />
          </View>
        ))}
      </Section>

      <Section title={t('dailyLimit')}>
        <Segmented<PlayLimit>
          options={[
            ...([30, 45, 60] as const).map((m) => ({ value: m, label: `${m}m` })),
            { value: 'none' as const, label: t('noLimit') },
          ]}
          value={store.playLimit}
          onChange={(playLimit) => store.setPref({ playLimit })}
        />
        {isDeviceLockAvailable ? (
          <ToggleRow
            label={t('lockPhone')}
            sub={t('lockPhoneSub')}
            value={lockAllowed}
            onChange={(on) => {
              if (on) requestLockPermission(t('lockPhoneSub'));
              else {
                removeLockPermission();
                setLockAllowed(false);
              }
            }}
          />
        ) : null}
        <ToggleRow
          label={t('offline')}
          sub={t('offlineSub')}
          value={store.offlinePack}
          onChange={(offlinePack) => store.setPref({ offlinePack })}
        />
      </Section>

      <Section title={t('cloudBackup')}>
        <Txt testID="sync-state" weight="bold" size={15}>{t(SYNC_LABEL[sync.state])}</Txt>
        {sync.pending > 0 ? <Txt testID="sync-pending" size={14} color={colors.textMuted}>{t('syncPending')}: {sync.pending}</Txt> : null}
        {sync.failed > 0 ? <Txt size={14} color={colors.candyPinkDark}>{t('syncFailed')}: {sync.failed}</Txt> : null}
        {sync.state !== 'local-only' ? (
          <BigButton
            testID="sync-retry"
            label={t('syncNow')}
            variant="white"
            height={MIN_TOUCH}
            size={16}
            onPress={() => { void syncManager.retryNow(); }}
          />
        ) : null}
      </Section>

      <BigButton testID="reset" label={t('reset')} variant="pink" size={17} onPress={() => setConfirm('reset')} />
      <BigButton testID="delete-child" label={t('deleteChild')} variant="white" size={17} onPress={() => setConfirm('delete')} />

      <ConfirmDialog
        visible={confirm === 'reset'}
        title={t('resetConfirm')}
        body={`${profile.name}: ${t('resetBody')}`}
        confirmLabel={t('resetYes')}
        confirmTestID="reset-yes"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          store.resetProgress();
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        visible={confirm === 'delete'}
        title={t('deleteConfirm')}
        body={`${profile.name}: ${t('deleteBody')}`}
        confirmLabel={t('deleteYes')}
        confirmTestID="delete-yes"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void store.deleteChild(profile.id).then(() => {
            if (Object.keys(useAppStore.getState().profiles).length === 0) {
              navigation.reset({ index: 0, routes: [{ name: 'ChildProfile', params: { mode: 'create' } }] });
            }
          });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  childRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  childAvatar: { fontSize: 48, lineHeight: 62 },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, borderRadius: radii.lg, padding: spacing.sm, alignItems: 'center', minHeight: 84, justifyContent: 'center' },
  masteryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  backdrop: { flex: 1, backgroundColor: 'rgba(30,41,59,0.55)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  dialog: { width: '100%', maxWidth: 380, backgroundColor: colors.card, borderRadius: radii.xl, padding: spacing.xl, gap: spacing.md },
});
