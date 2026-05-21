import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { OptionCard } from '../../src/components/OptionCard';
import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';
import { formatPrice, plans } from '../../src/data/catalog';
import { useRegistration } from '../../src/state/registration';
import { spacing } from '../../src/theme';

export default function PlanScreen() {
  const registration = useRegistration();
  const availablePlans = plans.filter(
    (plan) => plan.departmentId === registration.department?.id
  );

  if (!registration.department || !registration.course) {
    return (
      <Screen>
        <PageHeader
          title="Start with your department"
          subtitle="Plans are shown after we know your department and course."
        />
        <Button
          label="Choose department"
          onPress={() => router.replace('/register/department')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        eyebrow="Step 3 of 5"
        title="Choose your plan"
        subtitle="Start with a simple daily practice plan. Plan data will come from the VPS API in the next phase."
      />
      <View style={styles.list}>
        {availablePlans.map((plan) => (
          <OptionCard
            key={plan.id}
            title={plan.name}
            subtitle={`${plan.dailyQuestions} questions daily · ${plan.durationDays} days`}
            meta={`${formatPrice(plan)}${plan.highlight ? ` · ${plan.highlight}` : ''}`}
            selected={registration.plan?.id === plan.id}
            onPress={() => {
              registration.setPlan(plan);
              router.push('/register/profile');
            }}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
});
