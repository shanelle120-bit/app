import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { FlatList, Platform, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, mediaUrl, parseDate, uploadFile } from "@/src/api";
import { GifPicker } from "@/src/components/gif-picker";
import { Avatar, Loader } from "@/src/components/ui";
import { VoiceBubble, VoiceRecorder } from "@/src/components/voice-message";
import { useMediaPicker } from "@/src/hooks/use-media-picker";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import type { AuthorSummary, Gif, Message } from "@/src/types";

export default function Conversation() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pick } = useMediaPicker();
  const [text, setText] = useState("");
  const [gifOpen, setGifOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const listRef = useRef<FlatList>(null);

  const convQuery = useQuery({ queryKey: ["conversation", id], queryFn: () => api<{ other_user: AuthorSummary }>(`/conversations/${id}`), enabled: !!id });
  const messages = useQuery({
    queryKey: ["messages", id],
    queryFn: () => api<Message[]>(`/conversations/${id}/messages`),
    enabled: !!id,
    refetchInterval: 3000,
  });

  const send = useMutation({
    mutationFn: (body: { text?: string; gif_url?: string; image_url?: string; audio_url?: string; audio_duration?: number }) => api<Message>(`/conversations/${id}/messages`, { method: "POST", body }),
    onSuccess: (msg) => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.setQueryData(["messages", id], (old: Message[] | undefined) => [...(old ?? []), msg]);
      qc.invalidateQueries({ queryKey: ["conversations"] });
      setText("");
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const sendImage = async () => {
    const picked = await pick("image");
    if (!picked) return;
    setUploading(true);
    try {
      const res = await uploadFile(picked.uri, picked.name, picked.mimeType);
      send.mutate({ image_url: res.url });
    } catch (e: any) {
      toast.show(e.message ?? "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const other = convQuery.data?.other_user;
  const data = [...(messages.data ?? [])].reverse();

  return (
    <View style={styles.root} testID="conversation-screen">
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/chat"))} style={styles.back} testID="conversation-back-button">
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        {other ? (
          <Pressable onPress={() => router.push(`/user/${other.user_id}`)} style={styles.peer} testID="conversation-peer">
            <Avatar uri={other.avatar_url} name={other.display_name} size={36} />
            <View>
              <Text style={styles.peerName}>{other.display_name}</Text>
              <Text style={styles.peerMeta}>@{other.username}</Text>
            </View>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <FlatList
          ref={listRef}
          data={data}
          inverted
          keyExtractor={(m) => m.message_id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 6 }}
          ListEmptyComponent={
            messages.isLoading ? (
              <Loader />
            ) : (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>Say hello to {other?.display_name ?? "this trader"}</Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <View style={[styles.msgRow, item.is_mine && styles.msgRowMine]} testID={`message-${item.message_id}`}>
              <View style={[styles.bubble, item.is_mine ? styles.bubbleMine : styles.bubbleTheirs, (item.gif_url || item.image_url) && styles.bubbleMedia]}>
                {item.audio_url ? <VoiceBubble url={item.audio_url} duration={item.audio_duration ?? 0} mine={item.is_mine} /> : null}
                {item.gif_url ? <Image source={{ uri: item.gif_url }} style={styles.media} contentFit="cover" /> : null}
                {item.image_url ? <Image source={{ uri: mediaUrl(item.image_url) }} style={styles.media} contentFit="cover" /> : null}
                {item.text ? <Text style={[styles.msgText, item.is_mine && { color: colors.onBrandTertiary }]}>{item.text}</Text> : null}
              </View>
              <Text style={[styles.time, item.is_mine && { textAlign: "right" }]}>
                {parseDate(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          )}
        />
        <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
          {recording ? (
            <VoiceRecorder
              onClose={() => setRecording(false)}
              onSend={async (audio) => {
                await send.mutateAsync({ audio_url: audio.url, audio_duration: audio.duration });
              }}
            />
          ) : (
            <>
              <Pressable onPress={sendImage} style={styles.iconBtn} disabled={uploading} testID="message-add-image">
                <Ionicons name="image-outline" size={22} color={uploading ? colors.muted : colors.brandSecondary} />
              </Pressable>
              <Pressable onPress={() => setGifOpen(true)} style={styles.iconBtn} testID="message-gif-button">
                <Text style={styles.gifText}>GIF</Text>
              </Pressable>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Message…"
                placeholderTextColor={colors.muted}
                style={styles.input}
                multiline
                maxLength={2000}
                testID="message-input"
              />
              {text.trim() ? (
                <Pressable onPress={() => send.mutate({ text: text.trim() })} disabled={send.isPending} style={[styles.sendBtn, send.isPending && { opacity: 0.4 }]} testID="message-send-button">
                  <Ionicons name="arrow-up" size={20} color={colors.onBrandPrimary} />
                </Pressable>
              ) : (
                <Pressable onPress={() => setRecording(true)} style={styles.sendBtn} testID="message-voice-button">
                  <Ionicons name="mic" size={20} color={colors.onBrandPrimary} />
                </Pressable>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      <GifPicker
        visible={gifOpen}
        onClose={() => setGifOpen(false)}
        onSelect={(g: Gif) => {
          setGifOpen(false);
          send.mutate({ gif_url: g.url });
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.glass },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  peer: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minHeight: 44 },
  peerName: { color: colors.onSurface, fontSize: 15, fontWeight: "500" },
  peerMeta: { color: colors.muted, fontSize: 12 },
  emptyWrap: { alignItems: "center", paddingVertical: 40, transform: [{ scaleY: -1 }] },
  emptyText: { color: colors.muted, fontSize: 14 },
  msgRow: { maxWidth: "80%", alignSelf: "flex-start" },
  msgRowMine: { alignSelf: "flex-end" },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: colors.brandTertiary, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: colors.surfaceTertiary, borderBottomLeftRadius: 6 },
  bubbleMedia: { padding: 4 },
  media: { width: 220, height: 170, borderRadius: 14, backgroundColor: colors.surfaceSecondary },
  msgText: { color: colors.onSurfaceTertiary, fontSize: 15, lineHeight: 21 },
  time: { color: colors.muted, fontSize: 10, marginTop: 3, marginHorizontal: 6 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 6, paddingHorizontal: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceSecondary },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  gifText: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 1, borderWidth: 1.5, borderColor: colors.brandSecondary, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2 },
  input: { flex: 1, color: colors.onSurface, fontSize: 15, maxHeight: 120, minHeight: 44, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.surfaceTertiary, borderRadius: 22 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
}));
