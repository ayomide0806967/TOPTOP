import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';

export default function SubscriptionScreen() {
  return (
    <Screen>
      <PageHeader
        eyebrow="Subscription"
        title="Plan and payment"
        subtitle="Active, pending, and expired plan states will be shown here with a simple renewal path."
      />
    </Screen>
  );
}
