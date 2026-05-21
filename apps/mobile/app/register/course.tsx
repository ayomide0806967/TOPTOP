import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { OptionCard } from '../../src/components/OptionCard';
import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';
import { useRegistration } from '../../src/state/registration';
import { spacing } from '../../src/theme';

export default function CourseScreen() {
  const registration = useRegistration();

  if (!registration.department) {
    return (
      <Screen>
        <PageHeader
          title="Choose a department first"
          subtitle="Your course list depends on the department you select."
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
        eyebrow="Step 2 of 5"
        title="Select your course"
        subtitle={`Choose the ${registration.department.name} path you want to prepare for.`}
      />
      <View style={styles.list}>
        {registration.department.courses.map((course) => (
          <OptionCard
            key={course.id}
            title={course.name}
            subtitle={course.description}
            selected={registration.course?.id === course.id}
            onPress={() => {
              registration.setCourse(course);
              router.push('/register/plan');
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
