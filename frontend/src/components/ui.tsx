import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ActivityIndicator, Pressable, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";

import { mediaUrl } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  testID?: string;
  style?: ViewStyle;
  small?: boolean;
};

export function Button({ title, onPress, variant = "primary", loading, disabled, icon, testID, style, small }: ButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const textColor =
    variant === "primary" ? colors.onBrandPrimary : variant === "danger" ? colors.error : colors.onSurface;
  const content = (
    <View style={styles.btnInner}>
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <>
          {icon ? <Ionicons name={icon as any} size={small ? 16 : 18} color={textColor} /> : null}
          <Text style={[styles.btnText, small && styles.btnTextSmall, { color: textColor }]}>{title}</Text>
        </>
      )}
    </View>
  );
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        variant === "secondary" && styles.btnSecondary,
        variant === "ghost" && styles.btnGhost,
        variant === "danger" && styles.btnDanger,
        pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] },
        isDisabled && { opacity: 0.55 },
        style,
      ]}
    >
      {variant === "primary" ? (
        <LinearGradient
          colors={[colors.brandPrimary, colors.brandTertiary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, small && styles.btnSmall]}
        >
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
type InputProps = TextInputProps & { label?: string; icon?: string; error?: string; right?: React.ReactNode };

export function Input({ label, icon, error, right, style, ...props }: InputProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.inputWrap}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <View style={[styles.inputRow, error ? { borderColor: colors.error } : null]}>
        {icon ? <Ionicons name={icon as any} size={18} color={colors.muted} /> : null}
        <TextInput placeholderTextColor={colors.muted} style={[styles.input, style]} {...props} />
        {right}
      </View>
      {error ? <Text style={styles.inputError}>{error}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
export function Avatar({
  uri,
  name,
  size = 40,
  ring,
  testID,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
  ring?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const initials = (name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const inner = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.surfaceTertiary,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {uri ? (
        <Image source={{ uri: mediaUrl(uri) }} style={{ width: size, height: size }} contentFit="cover" transition={150} />
      ) : (
        <Text style={{ color: colors.brandSecondary, fontSize: size * 0.36, fontWeight: "500" }}>{initials}</Text>
      )}
    </View>
  );
  if (!ring) return <View testID={testID}>{inner}</View>;
  return (
    <LinearGradient
      testID={testID}
      colors={[colors.brandPrimary, colors.brandSecondary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size + 6, height: size + 6, borderRadius: (size + 6) / 2, alignItems: "center", justifyContent: "center" }}
    >
      <View style={{ padding: 2, backgroundColor: colors.surface, borderRadius: (size + 4) / 2 }}>{inner}</View>
    </LinearGradient>
  );
}

// ---------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------
export function Chip({
  label,
  selected,
  onPress,
  testID,
  tone = "brand",
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
  tone?: "brand" | "cyan" | "neutral";
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const activeBg = tone === "cyan" ? colors.cyanSoft : tone === "neutral" ? colors.surfaceTertiary : colors.brandSoft;
  const activeBorder = tone === "cyan" ? colors.brandSecondary : tone === "neutral" ? colors.borderStrong : colors.brandPrimary;
  const activeText = tone === "cyan" ? colors.brandSecondary : tone === "neutral" ? colors.onSurface : colors.onSurface;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, selected && { backgroundColor: activeBg, borderColor: activeBorder }]}
    >
      <Text style={[styles.chipText, selected && { color: activeText }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------
export function IconButton({
  name,
  onPress,
  color,
  size = 22,
  testID,
  style,
}: {
  name: string;
  onPress?: () => void;
  color?: string;
  size?: number;
  testID?: string;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
        pressed && { backgroundColor: colors.surfaceTertiary },
        style,
      ]}
    >
      <Ionicons name={name as any} size={size} color={color ?? colors.onSurface} />
    </Pressable>
  );
}

export function EmptyState({ icon, title, subtitle, action }: { icon: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.empty} testID="empty-state">
      <View style={styles.emptyIcon}>
        <Ionicons name={icon as any} size={30} color={colors.brandSecondary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySubtitle}>{subtitle}</Text> : null}
      {action ? <View style={{ marginTop: 16 }}>{action}</View> : null}
    </View>
  );
}

export function Loader({ testID }: { testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingVertical: 40, alignItems: "center" }} testID={testID ?? "loader"}>
      <ActivityIndicator color={colors.brandPrimary} />
    </View>
  );
}

export function ScreenHeader({
  title,
  onBack,
  right,
  testID,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.header} testID={testID}>
      {onBack ? <IconButton name="chevron-back" onPress={onBack} testID="back-button" /> : <View style={{ width: 44 }} />}
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ minWidth: 44, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  btn: { borderRadius: 999, overflow: "hidden", minHeight: 52, justifyContent: "center" },
  btnSmall: { minHeight: 40, paddingHorizontal: 16 },
  gradient: { minHeight: 52, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  btnInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnText: { fontSize: 16, fontWeight: "500", letterSpacing: 0.2 },
  btnTextSmall: { fontSize: 14 },
  btnSecondary: { backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 20 },
  btnGhost: { backgroundColor: "transparent", paddingHorizontal: 20 },
  btnDanger: { backgroundColor: colors.errorSoft, paddingHorizontal: 20 },

  inputWrap: { gap: 6 },
  inputLabel: { color: colors.muted, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  input: { flex: 1, color: colors.onSurface, fontSize: 16, paddingVertical: 12 },
  inputError: { color: colors.error, fontSize: 12 },

  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipText: { color: colors.muted, fontSize: 14 },

  empty: { alignItems: "center", paddingHorizontal: 32, paddingVertical: 48 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.cyanSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "500", textAlign: "center" },
  emptySubtitle: { color: colors.muted, fontSize: 14, textAlign: "center", marginTop: 6, lineHeight: 20 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    height: 56,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "500", flex: 1, textAlign: "center" },
}));
