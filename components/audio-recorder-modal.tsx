import React, { useState, useEffect } from "react";
import {
  Modal,
  Text,
  View,
  Pressable,
  Alert,
  ScrollView,
  TextInput,
} from "react-native";
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
// Helper Functions
// ============================================================================

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// ============================================================================
// Audio Recorder Modal
// ============================================================================

export function AudioRecorderModal({ visible, onClose, onSave }: AudioRecorderModalProps) {
  const colors = useColors();
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [transcription, setTranscription] = useState("");
  const [hasRecording, setHasRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  // Timer effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isRecording) {
      interval = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  const handleStartRecording = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsRecording(true);
      setDuration(0);
      setTranscription("");
      // In a real app, you would use expo-audio to start recording
      // For now, this is a placeholder
    } catch (error) {
      console.error("Error starting recording:", error);
      Alert.alert("Error", "Failed to start recording");
    }
  };

  const handleStopRecording = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsRecording(false);
      setHasRecording(true);
      // Simulate transcription (in real app, would use speech-to-text API)
      setTranscription(
        `[Audio recorded for ${formatDuration(duration)}] This is a placeholder transcription. In a real app, this would be converted from speech to text.`
      );
    } catch (error) {
      console.error("Error stopping recording:", error);
      Alert.alert("Error", "Failed to stop recording");
    }
  };

  const handlePlayRecording = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setIsPlaying(!isPlaying);
      // In a real app, you would use expo-audio to play the recording
    } catch (error) {
      console.error("Error playing recording:", error);
    }
  };

  const handleDiscardRecording = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRecording(false);
    setHasRecording(false);
    setDuration(0);
    setTranscription("");
    setIsPlaying(false);
  };

  const handleSave = async () => {
    if (!transcription.trim()) {
      Alert.alert("Error", "Please record something or add a note");
      return;
    }

    try {
      setLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await onSave(transcription);
      handleDiscardRecording();
      onClose();
    } catch (error) {
      console.error("Error saving recording:", error);
      Alert.alert("Error", "Failed to save recording");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <ScreenContainer className="bg-background" containerClassName="bg-background">
        {/* Header */}
        <View className="px-4 py-4 border-b border-border flex-row items-center justify-between">
          <Text className="text-xl font-bold text-foreground">Voice Note</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <MaterialIcons name="close" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 py-6" showsVerticalScrollIndicator={false}>
          {/* Recording Controls */}
          <View className="items-center gap-6 mb-8">
            {/* Waveform Visualization (Placeholder) */}
            <View
              style={{
                width: "100%",
                height: 100,
                backgroundColor: colors.surface,
                borderRadius: 12,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 2,
                borderColor: colors.border,
              }}
            >
              {isRecording ? (
                <View className="items-center gap-2">
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: colors.error,
                      opacity: 0.7,
                    }}
                  />
                  <Text className="text-sm font-semibold text-foreground">Recording...</Text>
                </View>
              ) : hasRecording ? (
                <View className="items-center gap-2">
                  <MaterialIcons name="graphic-eq" size={32} color={colors.primary} />
                  <Text className="text-sm text-muted">{formatDuration(duration)}</Text>
                </View>
              ) : (
                <View className="items-center gap-2">
                  <MaterialIcons name="mic" size={32} color={colors.muted} />
                  <Text className="text-sm text-muted">Ready to record</Text>
                </View>
              )}
            </View>

            {/* Duration Display */}
            <Text className="text-3xl font-bold text-foreground">
              {formatDuration(duration)}
            </Text>

            {/* Recording Buttons */}
            <View className="flex-row gap-4 justify-center">
              {!isRecording && !hasRecording && (
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
                    },
                  ]}
                >
                  <MaterialIcons name="mic" size={32} color="white" />
                </Pressable>
              )}

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
                    },
                  ]}
                >
                  <MaterialIcons name="stop" size={32} color="white" />
                </Pressable>
              )}

              {hasRecording && (
                <>
                  <Pressable
                    onPress={handlePlayRecording}
                    style={({ pressed }) => [
                      {
                        opacity: pressed ? 0.8 : 1,
                        backgroundColor: colors.primary,
                        width: 64,
                        height: 64,
                        borderRadius: 32,
                        justifyContent: "center",
                        alignItems: "center",
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={isPlaying ? "pause" : "play-arrow"}
                      size={32}
                      color="white"
                    />
                  </Pressable>

                  <Pressable
                    onPress={handleDiscardRecording}
                    style={({ pressed }) => [
                      {
                        opacity: pressed ? 0.8 : 1,
                        backgroundColor: colors.error,
                        width: 64,
                        height: 64,
                        borderRadius: 32,
                        justifyContent: "center",
                        alignItems: "center",
                      },
                    ]}
                  >
                    <MaterialIcons name="delete" size={32} color="white" />
                  </Pressable>
                </>
              )}
            </View>
          </View>

          {/* Transcription Display */}
          {transcription && (
            <View className="gap-3 mb-6">
              <Text className="text-sm font-semibold text-foreground">Transcription</Text>
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <Text className="text-sm text-foreground leading-relaxed">
                  {transcription}
                </Text>
              </View>

              {/* Edit Transcription */}
              <Text className="text-sm font-semibold text-foreground mt-4">
                Edit or Add Notes
              </Text>
              <TextInput
                placeholder="Add additional notes or corrections..."
                value={transcription}
                onChangeText={setTranscription}
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={4}
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 8,
                  padding: 12,
                  color: colors.foreground,
                  fontSize: 16,
                  textAlignVertical: "top",
                  fontFamily: "System",
                }}
              />
            </View>
          )}

          {/* Save Button */}
          {hasRecording && (
            <Pressable
              onPress={handleSave}
              disabled={loading}
              style={({ pressed }) => [
                {
                  opacity: pressed || loading ? 0.7 : 1,
                  backgroundColor: colors.primary,
                  borderRadius: 8,
                  paddingVertical: 12,
                  alignItems: "center",
                },
              ]}
            >
              <Text className="text-base font-semibold text-white">
                {loading ? "Saving..." : "Save Voice Note"}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </ScreenContainer>
    </Modal>
  );
}
