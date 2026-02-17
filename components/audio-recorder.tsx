import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

type RecorderState = "idle" | "recording" | "stopped";

interface AudioRecorderProps {
  maxDurationSeconds?: number;
  onRecorded?: (payload: { uri: string; base64?: string; durationSec: number; fileSize?: number }) => void;
}

export function AudioRecorder({ maxDurationSeconds = 300, onRecorded }: AudioRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [durationSec, setDurationSec] = useState(0);
  const [busy, setBusy] = useState(false);

  const label = useMemo(() => {
    if (state === "recording") return "Recording...";
    if (state === "stopped") return "Recording ready";
    return "Ready to record";
  }, [state]);

  const handleStart = async () => {
    setBusy(true);
    try {
      // TODO: Hook into expo-audio actual recording API.
      setState("recording");
      setDurationSec(0);
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      setState("stopped");
      const mockUri = `file://audio-${Date.now()}.m4a`;
      onRecorded?.({
        uri: mockUri,
        durationSec: Math.min(durationSec || 5, maxDurationSeconds),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="bg-surface border border-border rounded-xl p-4">
      <Text className="text-foreground font-semibold mb-2">Audio Recorder</Text>
      <Text className="text-muted text-sm mb-4">{label} (max {Math.floor(maxDurationSeconds / 60)} min)</Text>

      <View className="flex-row gap-3">
        <Pressable
          onPress={state === "recording" ? handleStop : handleStart}
          className="bg-primary rounded-lg px-4 py-3 flex-row items-center"
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <MaterialIcons name={state === "recording" ? "stop" : "mic"} size={18} color="white" />
              <Text className="text-white font-semibold ml-2">{state === "recording" ? "Stop" : "Record"}</Text>
            </>
          )}
        </Pressable>
      </View>

      <Text className="text-xs text-muted mt-3">TODO: waveform visualization + real-time timer + playback preview.</Text>
    </View>
  );
}
