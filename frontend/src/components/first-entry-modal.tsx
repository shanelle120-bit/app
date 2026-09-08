import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import React from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { Button } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

/** Reusable one-time entry modal used for the Trading Only disclaimer and the
 * Single & Mingle safety notice. Controlled entirely by the caller via `visible`. */
export function FirstEntryModal({
  visible,
  icon,
  title,
  body,
  confirmLabel,
  legalSlug,
  legalLabel,
  onConfirm,
  confirming,
  testID,
}: {
  visible: boolean;
  icon: string;
  title: string;
  body: string;
  confirmLabel: string;
  legalSlug: string;
  legalLabel: string;
  onConfirm: () => void;
  confirming?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop} testID={testID}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name={icon as any} size={28} color={colors.onSurface} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <Pressable onPress={() => router.push(`/legal/${legalSlug}`)} hitSlop={8} style={styles.linkRow} testID={`${testID}-legal-link`}>
            <Ionicons name="document-text-outline" size={14} color={colors.brandSecondary} />
            <Text style={styles.link}>Read the full {legalLabel}</Text>
          </Pressable>
          <Button title={confirmLabel} onPress={onConfirm} loading={confirming} testID={`${testID}-confirm-button`} style={{ marginTop: 18, width: "100%" }} />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 420, backgroundColor: colors.surfaceSecondary, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: "center" },
  iconWrap: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { color: colors.onSurface, fontSize: 20, fontWeight: "500", textAlign: "center" },
  body: { color: colors.silver, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, minHeight: 24 },
  link: { color: colors.brandSecondary, fontSize: 13, fontWeight: "500" },
}));
