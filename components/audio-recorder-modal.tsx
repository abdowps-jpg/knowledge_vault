import React, { useState } from "react";
import {
  Modal,
  Text,
  View,
  Pressable,
  Alert,
  Platform,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from "react-native";
import {
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  useAudioPlayerStatus,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

// ============================================================================
// Types
// ============================================================================

export interface AudioRecorderModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (content: string, audioUri?: string) => Promise<void>;
}

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// ============================================================================
// Audio Recorder Modal
// ============================================================================

export function AudioRecorderModal(props: AudioRecorderModalProps) {
  // expo-audio recording hooks (useAudioRecorder / useAudioRecorderState)
  // are unsupported on web and throw at call time. The native modal below
  // mounts those hooks, so we split the web path into a separate component
  // that never imports them into its render tree.
  if (Platform.OS === "web") {
    return <WebAudioRecorderFallback {...props} />;
  }
  return <NativeAudioRecorderModal {...props} />;
}

function WebAudioRecorderFallback({ visible, onClose }: AudioRecorderModalProps) {
  const colors = useColors();
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 20 }}>
          <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 16, marginBottom: 8 }}>
            Voice notes aren't available on the web yet
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 16 }}>
            Please use the mobile app to record voice notes. You can still view and play back audio attachments here.
          </Text>
          <Pressable
            onPress={onClose}
            style={{ alignSelf: "flex-end", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary }}
            accessibilityRole="button"
          >
            <Text style={{ color: "#ffffff", fontWeight: "700" }}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function NativeAudioRecorderModal({ visible, onClose, onSave }: AudioRecorderModalProps) {
  const colors = useColors();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);

  const recorder = useAudioRecorder(
    {
      extension: ".m4a",
      audioQuality: "high",
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 128000,
    } as any,
    undefined
  );
  const recordingState = useAudioRecorderState(recorder, 250);

  const player = useAudioPlayer(recordedUri ? { uri: recordedUri } : null);
  const playerStatus = useAudioPlayerStatus(player);

  const isRecording = recordingState?.isRecording ?? false;
  const durationSeconds = Math.floor((recordingState?.durationMillis ?? 0) / 1000);

  const handleStartRecording = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert(
          "Permission Required",
          "Please allow microphone access to record audio."
        );
        return;
      }
      setRecordedUri(null);
      setNote("");
      if (Platform.OS !== "web") {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      await recorder.record();
    } catch (error) {
      console.error("[AudioRecorder] Failed to start:", error);
      Alert.alert("Error", "Failed to start recording. Please try again.");
    }
  };

  const handleStopRecording = async () => {
    try {
      if (Platform.OS !== "web") {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      await recorder.stop();
      if (recorder.uri) {
        setRecordedUri(recorder.uri);
      }
    } catch (error) {
      console.error("[AudioRecorder] Failed to stop:", error);
      Alert.alert("Error", "Failed to stop recording.");
    }
  };

  const handlePlayPause = () => {
    if (!player) return;
    if (playerStatus?.playing) {
      player.pause();
    } else {
      player.seekTo(0);
      player.play();
    }
  };

  const handleDiscard = () => {
    if (isRecording) {
      recorder.stop().catch(() => undefined);
    }
    setRecordedUri(null);
    setNote("");
    onClose();
  };

  const handleReRecord = () => {
    setRecordedUri(null);
    setNote("");
  };

  const handleSave = async () => {
    if (!recordedUri) {
      Alert.alert("No Recording", "Please record something first.");
      return;
    }
    try {
      setLoading(true);
      if (Platform.OS !== "web") {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      const content =
        note.trim() || `Voice Note (${formatDuration(durationSeconds)})`;
      await onSave(content, recordedUri);
      setRecordedUri(null);
      setNote("");
    } catch (error) {
      console.error("[AudioRecorder] Failed to save:", error);
      Alert.alert("Error", "Failed to save recording.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleDiscard}
    >
      <ScreenContainer className="bg-background" containerClassName="bg-background">
        {/* Header */}
        <View className="px-4 py-4 border-b border-border flex-row items-center justify-between">
          <Text className="text-xl font-bold text-foreground">Voice Note</Text>
          <Pressable
            onPress={handleDiscard}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name="close" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 py-6" showsVerticalScrollIndicator={false}>
          {/* Visualization */}
          <View
            style={{
              width: "100%",
              height: 100,
              backgroundColor: colors.surface,
              borderRadius: 12,
              justifyContent: "center",
              alignItems: "center",
              borderWidth: 2,
              borderColor: isRecording ? colors.error : colors.border,
              marginBottom: 24,
            }}
          >
            {isRecording ? (
              <View style={{ alignItems: "center", gap: 8 }}>
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: colors.error,
                  }}
                />
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                  Recording...
                </Text>
              </View>
            ) : recordedUri ? (
              <View style={{ alignItems: "center", gap: 8 }}>
                <MaterialIcons name="graphic-eq" size={32} color={colors.primary} />
                <Text style={{ color: colors.muted, fontSize: 14 }}>
                  {formatDuration(durationSeconds)}
                </Text>
              </View>
            ) : (
              <View style={{ alignItems: "center", gap: 8 }}>
                <MaterialIcons name="mic" size={32} color={colors.muted} />
                <Text style={{ color: colors.muted, fontSize: 14 }}>Tap mic to start</Text>
              </View>
            )}
          </View>

          {/* Duration */}
          <Text
            style={{
              fontSize: 36,
              fontWeight: "700",
              color: colors.foreground,
              textAlign: "center",
              marginBottom: 24,
            }}
          >
            {formatDuration(durationSeconds)}
          </Text>

          {/* Controls */}
          <View
            style={{
              flexDirection: "row",
              gap: 16,
              justifyContent: "center",
              marginBottom: 32,
            }}
          >
            {/* Start recording */}
            {!isRecording && !recordedUri && (
              <Pressable
                onPress={handleStartRecording}
                style={({ pressed }) => [
                  {
                    opacity: pressed ? 0.8 : 1,
                    backgroundColor: colors.error,
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    justifyContent: "center",
                    alignItems: "center",
                    elevation: 4,
                  },
                ]}
              >
                <MaterialIcons name="mic" size={32} color="white" />
              </Pressable>
            )}

            {/* Stop recording */}
            {isRecording && (
              <Pressable
                onPress={handleStopRecording}
                style={({ pressed }) => [
                  {
                    opacity: pressed ? 0.8 : 1,
                    backgroundColor: colors.primary,
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    justifyContent: "center",
                    alignItems: "center",
                    elevation: 4,
                  },
                ]}
              >
                <MaterialIcons name="stop" size={32} color="white" />
              </Pressable>
            )}

            {/* Playback controls */}
            {recordedUri && (
              <>
                <Pressable
                  onPress={handlePlayPause}
                  style={({ pressed }) => [
                    {
                      opacity: pressed ? 0.8 : 1,
                      backgroundColor: colors.primary,
                      width: 64,
                      height: 64,
                      borderRadius: 32,
                      justifyContent: "center",
                      alignItems: "center",
                      elevation: 4,
                    },
                  ]}
                >
                  <MaterialIcons
                    name={playerStatus?.playing ? "pause" : "play-arrow"}
                    size={32}
                    color="white"
                  />
                </Pressable>
                <Pressable
                  onPress={handleReRecord}
                  style={({ pressed }) => [
                    {
                      opacity: pressed ? 0.8 : 1,
                      backgroundColor: colors.error,
                      width: 64,
                      height: 64,
                      borderRadius: 32,
                      justifyContent: "center",
                      alignItems: "center",
                      elevation: 4,
                    },
                  ]}
                >
                  <MaterialIcons name="replay" size={28} color="white" />
                </Pressable>
              </>
            )}
          </View>

          {/* Note input after recording */}
          {recordedUri && (
            <View style={{ gap: 8, marginBottom: 20 }}>
              <Text
                style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}
              >
                Add a note (optional)
              </Text>
              <TextInput
                placeholder="Describe what this recording is about..."
                value={note}
                onChangeText={setNote}
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 8,
                  padding: 12,
                  color: colors.foreground,
                  fontSize: 16,
                  textAlignVertical: "top",
                }}
              />
            </View>
          )}

          {/* Save button */}
          {recordedUri && (
            <Pressable
              onPress={handleSave}
              disabled={loading}
              style={({ pressed }) => [
                {
                  opacity: pressed || loading ? 0.7 : 1,
                  backgroundColor: colors.primary,
                  borderRadius: 8,
                  paddingVertical: 14,
                  alignItems: "center",
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
                  Save Voice Note
                </Text>
              )}
            </Pressable>
          )}
        </ScrollView>
      </ScreenContainer>
    </Modal>
  );
}
