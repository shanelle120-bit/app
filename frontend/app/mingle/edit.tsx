import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, mediaUrl, uploadFile } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button, Chip, Input, ScreenHeader } from "@/src/components/ui";
import { useMediaPicker } from "@/src/hooks/use-media-picker";
import type { MingleMeta, MingleProfile } from "@/src/mingle-types";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

const MAX_PHOTOS = 4;

export default function MingleEdit() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const { pick, blocked, openSettings } = useMediaPicker();

  const meta = useQuery({ queryKey: ["mingle", "meta"], queryFn: () => api<MingleMeta>("/mingle/meta"), staleTime: Infinity });
  const me = useQuery({ queryKey: ["mingle", "me"], queryFn: () => api<{ profile: MingleProfile | null }>("/mingle/me") });
  const existing = me.data?.profile ?? null;

  // Prefill from the main Level Up account where it makes sense.
  const traderTypeFromMarkets = (user?.markets?.length ?? 0) > 1 ? "Multiple" : (user?.markets?.[0] ?? "Multiple");
  const [form, setForm] = useState(() => ({
    display_name: existing?.display_name ?? (user?.display_name ?? "").split(" ")[0],
    age: existing?.age ? String(existing.age) : "",
    location: existing?.location ?? "",
    trader_type: existing?.trader_type ?? traderTypeFromMarkets,
    trading_style: existing?.trading_style ?? user?.trading_style ?? null,
    looking_for: existing?.looking_for ?? [],
    bio: existing?.bio ?? user?.bio ?? "",
    favorite_instrument: existing?.favorite_instrument ?? user?.instruments?.[0] ?? "",
    interests: existing?.interests ?? "",
    prompt_key: existing?.prompt_key ?? null,
    prompt_answer: existing?.prompt_answer ?? "",
  }));
  const [photos, setPhotos] = useState<string[]>(() =>
    existing?.photos?.length ? existing.photos : existing?.photo_url ? [existing.photo_url] : user?.avatar_url ? [user.avatar_url] : [],
  );
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const uploading = uploadingSlot !== null;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const addPhoto = async (slot: number) => {
    if (photos.length >= MAX_PHOTOS && slot >= photos.length) return;
    const picked = await pick("image");
    if (!picked) return;
    setUploadingSlot(slot);
    try {
      const res = await uploadFile(picked.uri, picked.name, picked.mimeType);
      setPhotos((list) => {
        const next = [...list];
        if (slot < next.length) next[slot] = res.url;
        else next.push(res.url);
        return next.slice(0, MAX_PHOTOS);
      });
    } catch (e: any) {
      toast.show(e.message ?? "Upload failed", "error");
    } finally {
      setUploadingSlot(null);
    }
  };
  const removePhoto = (slot: number) => setPhotos((list) => list.filter((_, i) => i !== slot));
  const makeMain = (slot: number) => setPhotos((list) => [list[slot], ...list.filter((_, i) => i !== slot)]);

  const save = useMutation({
    mutationFn: () => api("/mingle/me", { method: "PUT", body: { ...form, age: Number(form.age), photos, photo_url: photos[0] ?? null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mingle"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.show(existing ? "Mingle profile updated" : "Welcome to Single & Mingle 💜", "success");
      if (router.canGoBack()) router.back();
      else router.replace("/mingle");
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const age = Number(form.age);
  const canSave = form.display_name.trim().length > 0 && age >= 18 && age <= 99 && !uploading && !save.isPending;

  return (
    <View style={styles.root} testID="mingle-edit-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title={existing ? "Edit Mingle profile" : "Your Mingle profile"} onBack={() => router.back()} />
      </View>
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} bottomOffset={40} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>This is separate from your main profile. Only what you add here is shown in Single & Mingle — never your email, phone or exact location.</Text>

        <Text style={styles.label}>PHOTOS (UP TO {MAX_PHOTOS})</Text>
        <View style={styles.photoGrid} testID="mingle-photo-grid">
          {Array.from({ length: MAX_PHOTOS }).map((_, slot) => {
            const url = photos[slot];
            const busy = uploadingSlot === slot;
            const canAdd = slot === photos.length;
            if (url) {
              return (
                <View key={slot} style={styles.photoTile} testID={`mingle-photo-slot-${slot}`}>
                  <Pressable onPress={() => (slot === 0 ? addPhoto(slot) : makeMain(slot))} style={{ flex: 1 }} disabled={uploading} testID={`mingle-photo-tile-${slot}`}>
                    <Image source={{ uri: mediaUrl(url) }} style={styles.photoImg} contentFit="cover" transition={150} />
                    {busy ? (
                      <View style={styles.tileOverlay}>
                        <ActivityIndicator color={colors.onSurface} />
                      </View>
                    ) : null}
                  </Pressable>
                  {slot === 0 ? (
                    <View style={styles.mainTag}>
                      <Text style={styles.mainTagText}>Main</Text>
                    </View>
                  ) : null}
                  <Pressable onPress={() => removePhoto(slot)} hitSlop={8} style={styles.removeBtn} disabled={uploading} testID={`mingle-photo-remove-${slot}`}>
                    <Ionicons name="close" size={14} color={colors.onSurface} />
                  </Pressable>
                </View>
              );
            }
            return (
              <Pressable key={slot} onPress={() => canAdd && addPhoto(slot)} disabled={!canAdd || uploading} style={[styles.photoTile, styles.photoEmpty, !canAdd && { opacity: 0.4 }]} testID={`mingle-photo-slot-${slot}`}>
                {busy ? <ActivityIndicator color={colors.brandSecondary} /> : <Ionicons name={canAdd ? "add" : "image-outline"} size={canAdd ? 26 : 20} color={canAdd ? colors.brandSecondary : colors.muted} />}
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.photoHint}>First photo is your main photo. Tap another photo to make it main; tap the main photo to replace it.</Text>
        {blocked ? <Button title="Open Settings" small variant="secondary" onPress={openSettings} style={{ alignSelf: "flex-start", marginTop: 8 }} /> : null}

        <View style={styles.section}>
          <Input label="First name / display name" value={form.display_name} onChangeText={(v) => set("display_name", v)} maxLength={40} testID="mingle-name-input" />
          <Input label="Age (18+)" value={form.age} onChangeText={(v) => set("age", v.replace(/\D/g, "").slice(0, 2))} keyboardType="number-pad" placeholder="e.g. 29" testID="mingle-age-input" error={form.age && age < 18 ? "You must be 18 or older" : undefined} />
          <Input label="City / state (general)" value={form.location} onChangeText={(v) => set("location", v)} placeholder="e.g. Austin, TX" maxLength={60} testID="mingle-location-input" />
        </View>

        <Text style={styles.label}>TRADER TYPE</Text>
        <View style={styles.chips}>{(meta.data?.trader_types ?? []).map((t) => <Chip key={t} label={t} selected={form.trader_type === t} onPress={() => set("trader_type", t)} tone="neutral" testID={`mingle-type-${t.toLowerCase()}`} />)}</View>

        <Text style={styles.label}>TRADING STYLE</Text>
        <View style={styles.chips}>{(meta.data?.trading_styles ?? []).map((t) => <Chip key={t} label={t} selected={form.trading_style === t} onPress={() => set("trading_style", form.trading_style === t ? null : t)} tone="brand" />)}</View>

        <Text style={styles.label}>LOOKING FOR</Text>
        <View style={styles.chips}>
          {(meta.data?.looking_for ?? []).map((t) => (
            <Chip key={t} label={t} selected={form.looking_for.includes(t)} onPress={() => set("looking_for", form.looking_for.includes(t) ? form.looking_for.filter((x) => x !== t) : [...form.looking_for, t])} tone="cyan" testID={`mingle-looking-${t.toLowerCase().replace(/\s/g, "-")}`} />
          ))}
        </View>

        <View style={styles.section}>
          <Input label="Short bio" value={form.bio} onChangeText={(v) => set("bio", v)} multiline maxLength={300} placeholder="Who are you off the charts?" style={{ minHeight: 80, textAlignVertical: "top" }} testID="mingle-bio-input" />
          <Input label="Favorite market / instrument" value={form.favorite_instrument} onChangeText={(v) => set("favorite_instrument", v)} placeholder="e.g. NQ, BTC, GBPUSD" maxLength={40} testID="mingle-instrument-input" />
          <Input label="Interests outside trading" value={form.interests} onChangeText={(v) => set("interests", v)} placeholder="Hiking, jazz, cooking…" maxLength={200} testID="mingle-interests-input" />
        </View>

        <Text style={styles.label}>FUN PROMPT (OPTIONAL)</Text>
        <View style={styles.chips}>
          {Object.entries(meta.data?.prompts ?? {}).map(([k, label]) => (
            <Chip key={k} label={label} selected={form.prompt_key === k} onPress={() => set("prompt_key", form.prompt_key === k ? null : k)} tone="brand" testID={`mingle-prompt-${k}`} />
          ))}
        </View>
        {form.prompt_key ? (
          <View style={{ marginTop: 12 }}>
            <Input label={meta.data?.prompts[form.prompt_key]} value={form.prompt_answer} onChangeText={(v) => set("prompt_answer", v)} maxLength={200} placeholder="Finish the sentence…" testID="mingle-prompt-answer-input" />
          </View>
        ) : null}

        <Text style={styles.notice}>{meta.data?.safety_notice}</Text>
        <Button title={existing ? "Save changes" : "Join Single & Mingle"} onPress={() => save.mutate()} disabled={!canSave} loading={save.isPending} style={{ marginTop: 16 }} testID="mingle-save-button" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  intro: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  photoGrid: { flexDirection: "row", gap: 8 },
  photoTile: { flex: 1, aspectRatio: 0.8, borderRadius: 14, overflow: "hidden", backgroundColor: colors.surfaceTertiary },
  photoEmpty: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  photoImg: { width: "100%", height: "100%" },
  tileOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
  mainTag: { position: "absolute", left: 6, bottom: 6, backgroundColor: colors.brandPrimary, borderRadius: 999, paddingHorizontal: 8, height: 20, justifyContent: "center" },
  mainTagText: { color: colors.onBrandPrimary, fontSize: 10, letterSpacing: 0.4 },
  removeBtn: { position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
  photoHint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 8 },
  section: { gap: 14, marginTop: 20 },
  label: { color: colors.muted, fontSize: 12, letterSpacing: 0.6, marginTop: 24, marginBottom: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  notice: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 24 },
}));
