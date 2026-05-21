import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { OptionCard } from '../../src/components/OptionCard';
import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';
import { departments } from '../../src/data/catalog';
import { useRegistration } from '../../src/state/registration';
import { spacing } from '../../src/theme';

export default function DepartmentScreen() {
  const registration = useRegistration();

  return (
    <Screen>
      <PageHeader
        eyebrow="Step 1 of 5"
        title="Choose your department"
        subtitle="We use this to show the right courses, plans, and exam content from the start."
      />
      <View style={styles.list}>
        {departments.map((department) => (
          <OptionCard
            key={department.id}
            title={department.name}
            subtitle={department.subtitle}
            selected={registration.department?.id === department.id}
            onPress={() => {
              registration.setDepartment(department);
              if (department.courses.length === 1) {
                registration.setCourse(department.courses[0]);
                router.push('/register/plan');
              } else {
                router.push('/register/course');
              }
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
