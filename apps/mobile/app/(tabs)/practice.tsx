import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';

export default function PracticeScreen() {
  return (
    <Screen>
      <PageHeader
        eyebrow="Practice"
        title="Exam hall"
        subtitle="Timed quizzes, daily practice, question review, and progress tracking will live here."
      />
    </Screen>
  );
}
