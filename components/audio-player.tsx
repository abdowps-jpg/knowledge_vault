import React from "react";
import { Pressable, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

interface AudioPlayerProps {
  title?: string;
  durationSec?: number;
  sourceUri: string;
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function AudioPlayer({ title = "Audio Note", durationSec = 0, sourceUri }: AudioPlayerProps) {
  const player = useAudioPlayer(sourceUri ? { uri: sourceUri } : null);
  const status = useAudioPlayerStatus(player);

  const isPlaying = status?.playing ?? false;
  const positionSec = Math.floor((status?.currentTime ?? 0));
  const totalSec = durationSec > 0 ? durationSec : Math.floor((status?.duration ?? 0));
  const progressPct = totalSec > 0 ? Math.min(100, (positionSec / totalSec) * 100) : 0;

  const toggle = () => {
    if (!player || !sourceUri) return;
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  return (
    <View className="bg-surface border border-border rounded-xl p-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-foreground font-semibold" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-muted text-xs mt-1">
            {fmt(positionSec)} / {fmt(totalSec)}
          </Text>
        </View>
        <Pressable
          onPress={toggle}
          disabled={!sourceUri}
          className="bg-primary rounded-full w-10 h-10 items-center justify-center"
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <MaterialIcons name={isPlaying ? "pause" : "play-arrow"} size={20} color="white" />
        </Pressable>
      </View>
      <View className="h-2 bg-border rounded-full mt-3 overflow-hidden">
        <View className="h-2 bg-primary" style={{ width: `${progressPct}%` }} />
      </View>
    </View>
  );
}
