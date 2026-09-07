import Ionicons from "@react-native-vector-icons/ionicons";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";

import { mediaUrl, uploadFile } from "@/src/api";
import { Button } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export const MAX_VOICE_SECONDS = 60;

export function formatSeconds(total: number) {
  const s = Math.max(0, Math.round(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Clip = { uri: string; duration: number };
type Props = {
  onSend: (audio: { url: string; duration: number }) => Promise<void> | void;
  onClose: () => void;
};

/**
 * Inline voice-message recorder for the chat composer: record (auto-stops at 60s), review, send or discard.
 * Microphone permission is requested only when the member starts recording; blocked → Open Settings.
 */
export function VoiceRecorder({ onSend, onClose }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<"idle" | "recording" | "review" | "sending">("idle");
  const [clip, setClip] = useState<Clip | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopping = useRef(false);

  const seconds = Math.min(MAX_VOICE_SECONDS, (state.durationMillis ?? 0) / 1000);

  const stop = async () => {
    if (stopping.current || phase !== "recording") return;
    stopping.current = true;
    try {
      const duration = Math.min(MAX_VOICE_SECONDS, (recorder.getStatus().durationMillis ?? 0) / 1000);
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (recorder.uri && duration >= 0.5) {
        setClip({ uri: recorder.uri, duration });
        setPhase("review");
      } else {
        setError("Recording was too short");
        setPhase("idle");
      }
    } catch (e: any) {
      setError(e.message ?? "Recording failed");
      setPhase("idle");
    } finally {
      stopping.current = false;
    }
  };

  // Hard cap: stop automatically at 60 seconds.
  useEffect(() => {
    if (phase === "recording" && seconds >= MAX_VOICE_SECONDS) stop();
  }, [seconds, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setError(null);
    let perm = await AudioModule.getRecordingPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        setBlocked(true);
        return;
      }
      perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) setBlocked(true);
        else setError("Microphone access is needed to record a voice message");
        return;
      }
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase("recording");
    } catch (e: any) {
      setError(e.message ?? "Couldn't start recording");
    }
  };

  const discard = async () => {
    if (phase === "recording") {
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      } catch {}
    }
    setClip(null);
    onClose();
  };

  const send = async () => {
    if (!clip) return;
    setPhase("sending");
    try {
      const ext = Platform.OS === "web" ? "webm" : "m4a";
      const mime = Platform.OS === "web" ? "audio/webm" : "audio/m4a";
      const res = await uploadFile(clip.uri, `voice-${Date.now()}.${ext}`, mime);
      await onSend({ url: res.url, duration: Math.round(clip.duration * 10) / 10 });
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Couldn't send voice message");
      setPhase("review");
    }
  };

  useEffect(() => {
    return () => {
      if (recorder.isRecording) recorder.stop().catch(() => {});
    };
  }, [recorder]);

  if (blocked) {
    return (
      <View style={styles.bar} testID="voice-recorder">
        <Ionicons name="mic-off-outline" size={20} color={colors.error} />
        <Text style={styles.status} numberOfLines={2}>
          Microphone access is turned off for this app.
        </Text>
        <Button title="Open Settings" small variant="secondary" onPress={() => Linking.openSettings()} testID="voice-open-settings" />
        <Pressable onPress={onClose} style={styles.iconBtn} testID="voice-cancel">
          <Ionicons name="close" size={22} color={colors.muted} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.bar} testID="voice-recorder">
      <Pressable onPress={discard} style={styles.iconBtn} disabled={phase === "sending"} testID="voice-cancel">
        <Ionicons name="trash-outline" size={22} color={colors.error} />
      </Pressable>

      {phase === "review" && clip ? (
        <>
          <ClipPreview uri={clip.uri} duration={clip.duration} />
          <Pressable onPress={send} style={styles.sendBtn} testID="voice-send">
            <Ionicons name="arrow-up" size={20} color={colors.onBrandPrimary} />
          </Pressable>
        </>
      ) : phase === "sending" ? (
        <>
          <Text style={styles.status}>Sending voice message…</Text>
          <View style={[styles.sendBtn, { opacity: 0.4 }]}>
            <Ionicons name="arrow-up" size={20} color={colors.onBrandPrimary} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.timerWrap}>
            {phase === "recording" ? <View style={styles.dot} /> : <Ionicons name="mic-outline" size={18} color={colors.brandSecondary} />}
            <Text style={styles.timer} testID="voice-timer">
              {formatSeconds(seconds)} / {formatSeconds(MAX_VOICE_SECONDS)}
            </Text>
            <Text style={styles.status} numberOfLines={1}>
              {error ?? (phase === "recording" ? "Recording… tap ■ to finish" : "Tap ● to start recording")}
            </Text>
          </View>
          {phase === "recording" ? (
            <Pressable onPress={stop} style={[styles.recBtn, { backgroundColor: colors.error }]} testID="voice-stop">
              <Ionicons name="square" size={18} color={colors.onError} />
            </Pressable>
          ) : (
            <Pressable onPress={start} style={styles.recBtn} testID="voice-record">
              <Ionicons name="mic" size={20} color={colors.onBrandPrimary} />
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

function ClipPreview({ uri, duration }: Clip) {
  const styles = useStyles();
  const { colors } = useTheme();
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const toggle = () => {
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish || status.currentTime >= duration - 0.2) player.seekTo(0);
      player.play();
    }
  };
  return (
    <View style={styles.preview} testID="voice-preview">
      <Pressable onPress={toggle} style={styles.playBtn} testID="voice-preview-play">
        <Ionicons name={status.playing ? "pause" : "play"} size={18} color={colors.onBrandPrimary} style={status.playing ? undefined : { marginLeft: 2 }} />
      </Pressable>
      <Text style={styles.timer}>{formatSeconds(status.playing ? status.currentTime : duration)}</Text>
      <Text style={styles.status}>Voice message ready</Text>
    </View>
  );
}

/** Clean audio bubble for sent/received voice messages: play/pause + duration/elapsed, 1x only. */
export function VoiceBubble({ url, duration, mine }: { url: string; duration: number; mine: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const player = useAudioPlayer({ uri: mediaUrl(url)! });
  const status = useAudioPlayerStatus(player);
  const total = duration || status.duration || 0;
  const elapsed = status.playing || (status.currentTime > 0 && !status.didJustFinish) ? status.currentTime : 0;
  const progress = total ? Math.min(1, elapsed / total) : 0;
  const fg = mine ? colors.onBrandTertiary : colors.onSurface;

  const toggle = () => {
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish || (total && status.currentTime >= total - 0.2)) player.seekTo(0);
      player.play();
    }
  };

  return (
    <View style={styles.bubble} testID="voice-message">
      <Pressable onPress={toggle} style={[styles.playBtn, { backgroundColor: mine ? colors.onBrandTertiary : colors.brandPrimary }]} hitSlop={6} testID="voice-message-play">
        <Ionicons name={status.playing ? "pause" : "play"} size={18} color={mine ? colors.brandTertiary : colors.onBrandPrimary} style={status.playing ? undefined : { marginLeft: 2 }} />
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: fg }]} />
        </View>
        <Text style={[styles.duration, { color: fg }]} testID="voice-message-duration">
          {status.playing ? `${formatSeconds(elapsed)} / ` : ""}{formatSeconds(total)}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  bar: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minHeight: 44 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  timerWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 12, backgroundColor: colors.surfaceTertiary, borderRadius: 22 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error },
  timer: { color: colors.onSurface, fontSize: 14, fontVariant: ["tabular-nums"] },
  status: { color: colors.muted, fontSize: 12, flex: 1 },
  recBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  preview: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, paddingHorizontal: 6, backgroundColor: colors.surfaceTertiary, borderRadius: 22 },
  playBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  bubble: { flexDirection: "row", alignItems: "center", gap: 10, width: 220, paddingVertical: 4 },
  track: { height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: colors.borderStrong },
  fill: { height: "100%", borderRadius: 2 },
  duration: { fontSize: 12, fontVariant: ["tabular-nums"] },
}));
