import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

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
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggle = () => {
    // TODO: Integrate expo-audio playback controls.
    setPlaying((v) => !v);
  };

  return (
    <View className="bg-surface border border-border rounded-xl p-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-foreground font-semibold" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-muted text-xs mt-1">
            {fmt(progress)} / {fmt(durationSec)} | {sourceUri ? "Local" : "Unknown"}
          </Text>
        </View>
        <Pressable onPress={toggle} className="bg-primary rounded-full w-10 h-10 items-center justify-center">
          <MaterialIcons name={playing ? "pause" : "play-arrow"} size={20} color="white" />
        </Pressable>
      </View>
      <View className="h-2 bg-border rounded-full mt-3 overflow-hidden">
        <View className="h-2 bg-primary" style={{ width: `${Math.min(100, (progress / Math.max(durationSec, 1)) * 100)}%` }} />
      </View>
      <Text className="text-xs text-muted mt-2">TODO: seek + real playback progress + buffered state.</Text>
    </View>
  );
}
