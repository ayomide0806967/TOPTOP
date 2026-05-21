import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../src/components/Button';
import { PageHeader } from '../src/components/PageHeader';
import { Screen } from '../src/components/Screen';
import { colors, radii, spacing, type } from '../src/theme';

export default function WelcomeScreen() {
  return (
    <Screen>
      <View style={styles.logoMark}>
        <Text style={styles.logoText}>AN</Text>
      </View>
      <PageHeader
        title="Simple CBT practice for health professionals"
        subtitle="Choose your path, pay securely, and start daily exam practice without fighting the app."
      />
      <View style={styles.actions}>
        <Button label="Sign in" onPress={() => router.push('/sign-in')} />
        <Button
          label="Create account"
          variant="secondary"
          onPress={() => router.push('/register/department')}
        />
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Built for your exam flow</Text>
        <Text style={styles.panelBody}>
          Nursing, Midwifery, Public Health, Community Health, and Post Basic
          courses all start from one guided registration path.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logoMark: {
    width: 58,
    height: 58,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  logoText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
  },
  actions: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  panelTitle: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '800',
  },
  panelBody: {
    color: colors.muted,
    fontSize: type.small,
    lineHeight: 20,
  },
});
