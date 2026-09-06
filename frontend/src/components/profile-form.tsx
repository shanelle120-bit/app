import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api, mediaUrl, uploadFile } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Avatar, Button, Chip, Input } from "@/src/components/ui";
import { useMediaPicker } from "@/src/hooks/use-media-picker";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import type { User } from "@/src/types";

type Options = { markets: string[]; trading_styles: string[]; sessions: string[] };

type Props = { mode: "onboarding" | "edit"; onSaved: () => void; bottomPadding: number };

export function ProfileForm({ mode, onSaved, bottomPadding }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const { user, setUser } = useAuth();
  const { pick, blocked, openSettings } = useMediaPicker();

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [markets, setMarkets] = useState<string[]>(user?.markets ?? []);
  const [instruments, setInstruments] = useState((user?.instruments ?? []).join(", "));
  const [style, setStyle] = useState<string | null>(user?.trading_style ?? null);
  const [session, setSession] = useState<string | null>(user?.trading_session ?? null);
  const [avatar, setAvatar] = useState<string | null>(user?.avatar_url ?? null);
  const [cover, setCover] = useState<string | null>(user?.cover_url ?? null);
  const [uploading, setUploading] = useState<"avatar" | "cover" | null>(null);

  const options = useQuery({ queryKey: ["profile-options"], queryFn: () => api<Options>("/meta/options"), staleTime: Infinity });

  const pickAndUpload = async (target: "avatar" | "cover") => {
    const picked = await pick("image");
    if (!picked) return;
    setUploading(target);
    try {
      const res = await uploadFile(picked.uri, picked.name, picked.mimeType);
      if (target === "avatar") setAvatar(res.url);
      else setCover(res.url);
    } catch (e: any) {
      toast.show(e.message ?? "Upload failed", "error");
    } finally {
      setUploading(null);
    }
  };

  const save = useMutation({
    mutationFn: () =>
      api<User>("/me", {
        method: "PUT",
        body: {
          display_name: displayName.trim(),
          username: username.trim() || undefined,
          bio,
          markets,
          instruments: instruments
            .split(/[,\s]+/)
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean)
            .slice(0, 12),
          trading_style: style ?? undefined,
          trading_session: session ?? undefined,
          avatar_url: avatar ?? undefined,
          cover_url: cover ?? undefined,
          onboarding_complete: true,
        },
      }),
    onSuccess: (u) => {
      setUser(u);
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
      toast.show(mode === "onboarding" ? "Welcome to the hub!" : "Profile updated", "success");
      onSaved();
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const toggleMarket = (m: string) => setMarkets((list) => (list.includes(m) ? list.filter((x) => x !== m) : [...list, m]));
  const canSave = displayName.trim().length > 0 && !uploading && !save.isPending;

  return (
    <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPadding + 96 }]} bottomOffset={40} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => pickAndUpload("cover")} style={styles.cover} testID="profile-form-cover">
        {cover ? <Image source={{ uri: mediaUrl(cover) }} style={styles.coverImage} contentFit="cover" /> : null}
        <View style={styles.coverHint}>
          {uploading === "cover" ? <ActivityIndicator color={colors.onSurface} /> : <Ionicons name="image-outline" size={18} color={colors.onSurface} />}
          <Text style={styles.coverHintText}>{cover ? "Change cover" : "Add cover photo"}</Text>
        </View>
      </Pressable>
      <View style={styles.avatarRow}>
        <Pressable onPress={() => pickAndUpload("avatar")} testID="profile-form-avatar">
          <Avatar uri={avatar} name={displayName || user?.display_name} size={88} />
          <View style={styles.avatarBadge}>
            {uploading === "avatar" ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Ionicons name="camera" size={14} color={colors.onBrandPrimary} />}
          </View>
        </Pressable>
        <Text style={styles.avatarHint}>Tap to change photo</Text>
      </View>
      {blocked ? (
        <View style={styles.blocked}>
          <Text style={styles.blockedText}>Photo access is turned off for this app.</Text>
          <Button title="Open Settings" small variant="secondary" onPress={openSettings} testID="profile-form-open-settings" />
        </View>
      ) : null}

      <View style={styles.section}>
        <Input label="Display name" placeholder="Your name" value={displayName} onChangeText={setDisplayName} testID="profile-form-name" />
        <Input label="Username" placeholder="handle" autoCapitalize="none" value={username} onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ""))} testID="profile-form-username" icon="at-outline" />
        <Input label="Bio" placeholder="What do you trade, and how?" value={bio} onChangeText={setBio} multiline maxLength={240} style={{ minHeight: 80, textAlignVertical: "top" }} testID="profile-form-bio" />
      </View>

      <Text style={styles.label}>MARKETS TRADED</Text>
      <View style={styles.chips}>
        {(options.data?.markets ?? []).map((m) => (
          <Chip key={m} label={m} selected={markets.includes(m)} onPress={() => toggleMarket(m)} tone="neutral" testID={`market-chip-${m.toLowerCase()}`} />
        ))}
      </View>

      <View style={styles.section}>
        <Input label="Favorite instruments" placeholder="NQ, ES, BTC, EURUSD" autoCapitalize="characters" value={instruments} onChangeText={setInstruments} testID="profile-form-instruments" />
      </View>

      <Text style={styles.label}>TRADING STYLE</Text>
      <View style={styles.chips}>
        {(options.data?.trading_styles ?? []).map((s) => (
          <Chip key={s} label={s} selected={style === s} onPress={() => setStyle(style === s ? null : s)} tone="brand" testID={`style-chip-${s.toLowerCase().replace(/\s/g, "-")}`} />
        ))}
      </View>

      <Text style={styles.label}>TRADING SESSION</Text>
      <View style={styles.chips}>
        {(options.data?.sessions ?? []).map((s) => (
          <Chip key={s} label={s} selected={session === s} onPress={() => setSession(session === s ? null : s)} tone="cyan" testID={`session-chip-${s.toLowerCase().replace(/[\s/]+/g, "-")}`} />
        ))}
      </View>

      <View style={{ marginTop: 32 }}>
        <Button title={mode === "onboarding" ? "Enter the hub" : "Save changes"} onPress={() => save.mutate()} disabled={!canSave} loading={save.isPending} testID="profile-form-save" />
      </View>
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { paddingHorizontal: 16 },
  cover: { height: 120, borderRadius: 16, backgroundColor: colors.surfaceSecondary, overflow: "hidden", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  coverImage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  coverHint: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.overlay, borderRadius: 999, paddingHorizontal: 12, height: 32 },
  coverHintText: { color: colors.onSurface, fontSize: 12 },
  avatarRow: { alignItems: "center", marginTop: -44, gap: 6 },
  avatarBadge: { position: "absolute", right: 0, bottom: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandPrimary, borderWidth: 2, borderColor: colors.surface, alignItems: "center", justifyContent: "center" },
  avatarHint: { color: colors.muted, fontSize: 12 },
  blocked: { marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: colors.errorSoft, gap: 10 },
  blockedText: { color: colors.onSurface, fontSize: 14 },
  section: { gap: 14, marginTop: 20 },
  label: { color: colors.muted, fontSize: 12, letterSpacing: 0.6, marginTop: 24, marginBottom: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
}));
