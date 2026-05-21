import { router } from 'expo-router';
import { Button } from '../../src/components/Button';
import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';

export default function ProfileScreen() {
  return (
    <Screen>
      <PageHeader
        eyebrow="Profile"
        title="Account"
        subtitle="Profile details, support, session management, and sign out will live here."
      />
      <Button
        label="Sign out"
        variant="secondary"
        onPress={() => router.replace('/')}
      />
    </Screen>
  );
}
