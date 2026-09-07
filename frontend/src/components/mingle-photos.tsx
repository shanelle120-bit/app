import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from "react-native";

import { mediaUrl } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";

/** Swipeable photo gallery (up to 4) used on Single & Mingle cards. Fills its parent. */
export function MinglePhotos({ photos, testID }: { photos: string[]; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const list = photos.filter(Boolean);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  if (!list.length) {
    return (
      <LinearGradient colors={[colors.brandTertiary, colors.brandPrimary]} style={styles.fill} testID={testID}>
        <Ionicons name="person" size={80} color={colors.onSurface} style={{ opacity: 0.6 }} />
      </LinearGradient>
    );
  }

  return (
    <View style={styles.fill} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID={testID}>
      {width > 0 ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={32} style={styles.scroll} testID="mingle-photo-scroll">
          {list.map((p, i) => (
            <Image key={`${p}-${i}`} source={{ uri: mediaUrl(p) }} style={{ width, height: "100%" }} contentFit="cover" transition={150} />
          ))}
        </ScrollView>
      ) : null}
      {list.length > 1 ? (
        <View style={[styles.dots, { pointerEvents: "none" }]} testID="mingle-photo-dots">
          {list.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  fill: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  scroll: { width: "100%", height: "100%" },
  dots: { position: "absolute", top: 12, left: 12, right: 12, flexDirection: "row", gap: 4 },
  dot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.onSurface, opacity: 0.35 },
  dotActive: { opacity: 1 },
}));
