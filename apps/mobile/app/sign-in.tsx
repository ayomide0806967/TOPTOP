import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../src/components/Button';
import { PageHeader } from '../src/components/PageHeader';
import { Screen } from '../src/components/Screen';
import { TextField } from '../src/components/TextField';
import { colors, spacing, type } from '../src/theme';

export default function SignInScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  return (
    <Screen>
      <PageHeader
        eyebrow="Returning user"
        title="Sign in to continue"
        subtitle="Use your username, phone, or email. Existing migrated accounts will be guided into password setup."
      />
      <View style={styles.form}>
        <TextField
          label="Username, phone, or email"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoComplete="username"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
        />
        <Button
          label="Sign in"
          onPress={() => router.replace('/(tabs)/home')}
        />
      </View>
      <Button
        label="Create a new account"
        variant="ghost"
        onPress={() => router.push('/register/department')}
      />
      <Text style={styles.note}>
        Backend auth will be wired to the existing Better Auth profile flow in
        the next phase.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  note: {
    color: colors.muted,
    fontSize: type.small,
    lineHeight: 20,
    marginTop: spacing.lg,
  },
});
