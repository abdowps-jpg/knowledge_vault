import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { AudioService } from "@/lib/audio/audio-service";
import { IconSymbol } from "./ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

interface AudioRecorderModalV2Props {
  onSave: (uri: string, transcription: string) => void;
  onDiscard: () => void;
  isOpen: boolean;
}

export function AudioRecorderModalV2({
  onSave,
  onDiscard,
  isOpen,
}: AudioRecorderModalV2Props) {
  const colors = useColors();
  const audioService = AudioService.getInstance();

  // Recording state
  const recorder = useAudioRecorder(
    {
      extension: ".m4a",
      audioQuality: "high",
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
    } as any,
    (status) => {
      // Status listener for recording updates
      console.log("Recording status:", status);
    }
  );

  const recordingState = useAudioRecorderState(recorder, 100);

  // Local state
  const [transcription, setTranscription] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handleStartRecording = async () => {
    try {
      await recorder.record();
    } catch (error) {
      console.error("Error starting recording:", error);
    }
  };

  const handleStopRecording = async () => {
    try {
      await recorder.stop();
      // Transcription would happen here with server LLM
      // For now, just show the recording was saved
      setTranscription("Recording saved successfully");
    } catch (error) {
      console.error("Error stopping recording:", error);
    }
  };

  const handlePauseRecording = async () => {
    try {
      await recorder.pause();
    } catch (error) {
      console.error("Error pausing recording:", error);
    }
  };

  const handleResumeRecording = async () => {
    try {
      await recorder.record();
    } catch (error) {
      console.error("Error resuming recording:", error);
    }
  };

  const handlePlayRecording = async () => {
    try {
      if (recorder.uri) {
        // Play logic would go here
        setIsPlaying(!isPlaying);
      }
    } catch (error) {
      console.error("Error playing recording:", error);
    }
  };

  const handleSave = () => {
    if (recorder.uri) {
      onSave(recorder.uri, transcription);
    }
  };

  const handleDiscard = async () => {
    try {
      if (recorder.uri) {
        await audioService.deleteAudioFile(recorder.uri);
      }
      onDiscard();
    } catch (error) {
      console.error("Error discarding recording:", error);
    }
  };

  const durationSeconds = Math.floor((recordingState?.durationMillis || 0) / 1000);
  const durationFormatted = audioService.formatDuration(durationSeconds);

  return (
    <View className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
      <View className="bg-surface rounded-3xl p-6 w-11/12 max-w-md shadow-lg">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <Text className="text-xl font-bold text-foreground">Record Audio</Text>
          <Pressable
            onPress={handleDiscard}
            className="p-2"
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <IconSymbol name="chevron.right" size={24} color={colors.muted} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Duration Display */}
          <View className="bg-background rounded-2xl p-4 mb-6 items-center">
            <Text className="text-4xl font-bold text-primary mb-2">
              {durationFormatted}
            </Text>
            <Text className="text-sm text-muted">
              {recordingState?.isRecording ? "Recording..." : "Ready"}
            </Text>
          </View>

          {/* Recording Controls */}
          <View className="flex-row justify-center gap-4 mb-6">
            {!recordingState?.isRecording ? (
              <Pressable
                onPress={handleStartRecording}
                className="bg-primary rounded-full p-4"
                style={({ pressed }) => [
                  { transform: [{ scale: pressed ? 0.95 : 1 }] },
                ]}
              >
                <IconSymbol name="paperplane.fill" size={28} color="white" />
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={handlePauseRecording}
                  className="bg-warning rounded-full p-4"
                  style={({ pressed }) => [
                    { transform: [{ scale: pressed ? 0.95 : 1 }] },
                  ]}
                >
                  <IconSymbol name="paperplane.fill" size={28} color="white" />
                </Pressable>
                <Pressable
                  onPress={handleStopRecording}
                  className="bg-error rounded-full p-4"
                  style={({ pressed }) => [
                    { transform: [{ scale: pressed ? 0.95 : 1 }] },
                  ]}
                >
                  <IconSymbol name="paperplane.fill" size={28} color="white" />
                </Pressable>
              </>
            )}
          </View>

          {/* Playback Controls */}
          {recorder.uri && (
            <View className="flex-row justify-center gap-4 mb-6">
              <Pressable
                onPress={handlePlayRecording}
                className={`flex-1 py-3 rounded-lg items-center ${
                  isPlaying ? "bg-primary" : "bg-border"
                }`}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              >
                <Text className={isPlaying ? "text-white font-semibold" : "text-foreground font-semibold"}>
                  {isPlaying ? "Playing..." : "Play"}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Transcription Display */}
          <View className="mb-6">
            <Text className="text-sm font-semibold text-foreground mb-2">
              Transcription
            </Text>
            <TextInput
              value={transcription}
              onChangeText={setTranscription}
              placeholder="Transcription will appear here..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              editable={!isTranscribing}
              className="bg-background border border-border rounded-lg p-3 text-foreground"
              style={{ color: colors.foreground }}
            />
            {isTranscribing && (
              <View className="flex-row items-center gap-2 mt-2">
                <ActivityIndicator size="small" color={colors.primary} />
                <Text className="text-sm text-muted">Transcribing...</Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View className="flex-row gap-3">
            <Pressable
              onPress={handleDiscard}
              className="flex-1 py-3 rounded-lg bg-border items-center"
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <Text className="text-foreground font-semibold">Discard</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!recorder.uri}
              className={`flex-1 py-3 rounded-lg items-center ${
                recorder.uri ? "bg-primary" : "bg-muted"
              }`}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <Text className="text-white font-semibold">Save</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
