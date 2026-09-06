import * as ImagePicker from "expo-image-picker";
import { useCallback, useState } from "react";
import { Linking } from "react-native";

import { useToast } from "@/src/toast";

export type PickedMedia = { uri: string; name: string; mimeType: string; kind: "image" | "video"; width?: number; height?: number };

/**
 * Photo library picker that follows the permissions contract:
 * check -> explain -> request (max once more) -> Open Settings when blocked.
 */
export function useMediaPicker() {
  const toast = useToast();
  const [blocked, setBlocked] = useState(false);

  const ensurePermission = useCallback(async (): Promise<boolean> => {
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) {
      setBlocked(true);
      toast.show("Photo access is off. Enable it in Settings to share media.", "error");
      return false;
    }
    toast.show("Allow photo access to share charts and clips", "info");
    const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (res.granted) return true;
    if (!res.canAskAgain) setBlocked(true);
    toast.show("Photo access is needed to attach media", "error");
    return false;
  }, [toast]);

  const pick = useCallback(
    async (kind: "image" | "video"): Promise<PickedMedia | null> => {
      if (!(await ensurePermission())) return null;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: kind === "image" ? ["images"] : ["videos"],
        quality: 0.8,
        allowsEditing: false,
        videoMaxDuration: 60,
      });
      if (result.canceled || !result.assets?.length) return null;
      const a = result.assets[0];
      const isVideo = (a.type ?? kind) === "video";
      const ext = a.fileName?.split(".").pop() ?? (isVideo ? "mp4" : "jpg");
      const mime = a.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg");
      return {
        uri: a.uri,
        name: a.fileName ?? `upload.${ext}`,
        mimeType: mime,
        kind: isVideo ? "video" : "image",
        width: a.width,
        height: a.height,
      };
    },
    [ensurePermission],
  );

  const openSettings = useCallback(() => Linking.openSettings(), []);

  return { pick, blocked, openSettings };
}
