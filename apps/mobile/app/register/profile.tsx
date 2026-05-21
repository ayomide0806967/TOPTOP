import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { useRegistration } from '../../src/state/registration';
import { spacing } from '../../src/theme';

export default function ProfileScreen() {
  const registration = useRegistration();
  const [firstName, setFirstName] = useState(registration.profile.firstName);
  const [lastName, setLastName] = useState(registration.profile.lastName);
  const [email, setEmail] = useState(registration.profile.email);
  const [phone, setPhone] = useState(registration.profile.phone);
  const [password, setPassword] = useState(registration.profile.password);

  if (!registration.plan) {
    return (
      <Screen>
        <PageHeader
          title="Choose a plan first"
          subtitle="Your account is created after the department, course, and plan are selected."
        />
        <Button
          label="Choose plan"
          onPress={() => router.replace('/register/plan')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        eyebrow="Step 4 of 5"
        title="Create your profile"
        subtitle="Keep this short. Payment starts after your profile is saved."
      />
      <View style={styles.form}>
        <TextField
          label="First name"
          value={firstName}
          onChangeText={setFirstName}
        />
        <TextField
          label="Last name"
          value={lastName}
          onChangeText={setLastName}
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <TextField
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        <Button
          label="Continue to payment"
          onPress={() => {
            registration.setProfile({
              firstName,
              lastName,
              email,
              phone,
              password,
            });
            router.push('/register/payment');
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
});
