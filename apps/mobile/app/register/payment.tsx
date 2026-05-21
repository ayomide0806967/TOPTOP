import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';
import { formatPrice } from '../../src/data/catalog';
import { useRegistration } from '../../src/state/registration';
import { colors, radii, spacing, type } from '../../src/theme';

export default function PaymentScreen() {
  const registration = useRegistration();

  if (!registration.department || !registration.course || !registration.plan) {
    return (
      <Screen>
        <PageHeader
          title="Complete the setup first"
          subtitle="Payment starts after department, course, plan, and profile are selected."
        />
        <Button
          label="Start registration"
          onPress={() => router.replace('/register/department')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        eyebrow="Step 5 of 5"
        title="Confirm and pay"
        subtitle="The next phase will call the VPS API, open Paystack, and verify the payment before unlocking the dashboard."
      />
      <View style={styles.summary}>
        <SummaryRow label="Department" value={registration.department.name} />
        <SummaryRow label="Course" value={registration.course.name} />
        <SummaryRow label="Plan" value={registration.plan.name} />
        <SummaryRow label="Amount" value={formatPrice(registration.plan)} />
      </View>
      <View style={styles.actions}>
        <Button
          label="Pay securely with Paystack"
          onPress={() => router.replace('/(tabs)/home')}
        />
        <Button
          label="Change plan"
          variant="secondary"
          onPress={() => router.push('/register/plan')}
        />
      </View>
    </Screen>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  row: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  label: {
    color: colors.muted,
    fontSize: type.small,
    fontWeight: '700',
  },
  value: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '800',
  },
  actions: {
    gap: spacing.md,
  },
});
