import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';

export default function ResultsScreen() {
  return (
    <Screen>
      <PageHeader
        eyebrow="Results"
        title="Your performance"
        subtitle="Scores, completed quizzes, weak topics, and result review will be mapped from the current learner API."
      />
    </Screen>
  );
}
