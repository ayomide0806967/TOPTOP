import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type } from '../theme';

type OptionCardProps = {
  title: string;
  subtitle?: string;
  meta?: string;
  selected?: boolean;
  onPress?: () => void;
};

export function OptionCard({
  title,
  subtitle,
  meta,
  selected,
  onPress,
}: OptionCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.textGroup}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  pressed: {
    opacity: 0.9,
  },
  textGroup: {
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: type.small,
    lineHeight: 19,
  },
  meta: {
    color: colors.primaryDark,
    fontSize: type.small,
    fontWeight: '700',
  },
});
