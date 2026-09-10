import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import { api } from "@/src/api";
import { Button } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

const REASONS = ["Spam", "Harassment or bullying", "Inappropriate content", "Scam or fraud", "Impersonation", "Other"];

export type ReportTargetType = "post" | "comment" | "profile" | "message" | "mingle_user";

type Props = {
  visible: boolean;
  targetType: ReportTargetType;
  targetId: string;
  onClose: () => void;
};

const LABELS: Record<ReportTargetType, string> = {
  post: "post",
  comment: "comment",
  profile: "profile",
  message: "message",
  mingle_user: "member",
};

export function ReportModal({ visible, targetType, targetId, onClose }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");

  const close = () => {
    setReason(null);
    setDetails("");
    onClose();
  };

  const submit = useMutation({
    mutationFn: () => api("/reports", { method: "POST", body: { target_type: targetType, target_id: targetId, reason, details: details.trim() || null } }),
    onSuccess: () => {
      toast.show("Thanks — our team will review this.", "success");
      close();
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} testID="report-modal-backdrop">
        <View style={styles.sheet}>
          <Text style={styles.title}>Report {LABELS[targetType]}</Text>
          <Text style={styles.subtitle}>Help us understand what went wrong. Reports are reviewed by our team.</Text>
          <View style={styles.reasonWrap}>
            {REASONS.map((r) => (
              <Pressable key={r} onPress={() => setReason(r)} style={[styles.reasonChip, reason === r && styles.reasonChipActive]} testID={`report-reason-${r.replace(/\s+/g, "-")}`}>
                <Text style={[styles.reasonText, reason === r && styles.reasonTextActive]}>{r}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Add details (optional)"
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
            maxLength={500}
            testID="report-details-input"
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <Button title="Cancel" variant="secondary" onPress={close} style={{ flex: 1 }} />
            <Button title="Submit report" variant="danger" onPress={() => submit.mutate()} loading={submit.isPending} disabled={!reason} style={{ flex: 1 }} testID="report-submit-button" />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, gap: 4, borderTopWidth: 1, borderColor: colors.border },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: "600", textTransform: "capitalize" },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 14, lineHeight: 18 },
  reasonWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  reasonChip: { paddingHorizontal: 12, height: 36, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  reasonChipActive: { backgroundColor: colors.errorSoft, borderColor: colors.error },
  reasonText: { color: colors.muted, fontSize: 13 },
  reasonTextActive: { color: colors.error, fontWeight: "500" },
  input: { color: colors.onSurface, fontSize: 14, backgroundColor: colors.surfaceTertiary, borderRadius: 12, padding: 12, minHeight: 70, textAlignVertical: "top" },
}));
