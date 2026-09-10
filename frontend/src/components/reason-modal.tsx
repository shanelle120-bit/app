import React, { useEffect, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import { Button } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

type Props = {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  placeholder?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

/** Generic "type a reason, then confirm" modal — reused for every destructive/important admin action. */
export function ReasonPromptModal({ visible, title, description, confirmLabel, danger, placeholder, loading, onCancel, onConfirm }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!visible) setReason("");
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} testID="reason-modal-backdrop">
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={placeholder ?? "Reason (required)"}
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
            maxLength={500}
            testID="reason-modal-input"
            autoFocus
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <Button title="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1 }} testID="reason-modal-cancel" />
            <Button
              title={confirmLabel}
              variant={danger ? "danger" : "primary"}
              disabled={reason.trim().length < 3}
              loading={loading}
              onPress={() => onConfirm(reason.trim())}
              style={{ flex: 1 }}
              testID="reason-modal-confirm"
            />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: 20 },
  sheet: { backgroundColor: colors.surfaceSecondary, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.onSurface, fontSize: 17, fontWeight: "600" },
  description: { color: colors.muted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  input: { color: colors.onSurface, fontSize: 14, backgroundColor: colors.surfaceTertiary, borderRadius: 12, padding: 12, minHeight: 80, textAlignVertical: "top", marginTop: 14 },
}));
