import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';
import { colors, radii, spacing, type } from '../../src/theme';

export default function HomeScreen() {
  return (
    <Screen>
      <PageHeader
        eyebrow="Dashboard"
        title="Today’s practice"
        subtitle="This will become the learner home: subscription state, daily quiz, streak, and progress."
      />
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Daily CBT set</Text>
        <Text style={styles.cardBody}>
          100 questions from your selected course will appear here after we wire
          the API.
        </Text>
        <Button label="Start practice" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontSize: type.heading,
    fontWeight: '900',
  },
  cardBody: {
    color: colors.muted,
    fontSize: type.body,
    lineHeight: 24,
  },
});
