import { ChildProfileForm } from '../../components/ChildProfileForm';
import { Header, Screen } from '../../components/ui';
import { useAppStore } from '../../context/useAppStore';
import { useT } from '../../hooks/useT';
import type { RootProps } from '../../navigation/types';

/** Used by first-time onboarding, and by the Parent Zone to add or edit a child. */
export function ChildProfileScreen({ navigation, route }: RootProps<'ChildProfile'>) {
  const t = useT();
  const { mode, childId } = route.params;
  const existing = useAppStore((s) => (childId ? s.profiles[childId] : undefined));
  const createChild = useAppStore((s) => s.createChild);
  const updateChild = useAppStore((s) => s.updateChild);

  return (
    <Screen>
      <Header
        title={mode === 'edit' ? t('editChild') : t('childProfileTitle')}
        sub={mode === 'edit' ? existing?.displayId : t('childProfileSub')}
        onBack={navigation.canGoBack() ? navigation.goBack : undefined}
      />
      <ChildProfileForm
        submitLabel={mode === 'edit' ? t('saveProfile') : t('createProfile')}
        initial={existing && existing.ageGroup ? {
          nickname: existing.name, ageGroup: existing.ageGroup, gender: existing.gender, avatarId: existing.avatarId,
        } : undefined}
        onSubmit={async (input) => {
          if (mode === 'edit' && childId) {
            await updateChild(childId, input);
            navigation.goBack();
          } else {
            const child = await createChild(input);
            navigation.replace('ProfileCreated', { childId: child.id });
          }
        }}
      />
    </Screen>
  );
}
