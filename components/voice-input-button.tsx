import React from "react";
import { ActivityIndicator, Alert, Pressable, Text } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

import { useColors } from "@/hooks/use-colors";

type VoiceInputButtonProps = {
  onTranscript: (text: string) => void;
  language?: string;
  label?: string;
};

export function VoiceInputButton({
  onTranscript,
  language = "en-US",
  label = "Voice Input",
}: VoiceInputButtonProps) {
  const colors = useColors();
  const [isListening, setIsListening] = React.useState(false);

  const handleVoice = React.useCallback(() => {
    const webWindow = globalThis as any;
    const SpeechRecognitionCtor =
      webWindow?.SpeechRecognition || webWindow?.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      Alert.alert("Not supported", "Voice input is currently available on web browsers only.");
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = language;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onerror = () => {
        setIsListening(false);
        Alert.alert("Voice input failed", "Could not capture speech. Please try again.");
      };
      recognition.onend = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript?.trim?.();
        if (transcript) {
          onTranscript(transcript);
        }
      };

      recognition.start();
    } catch (error) {
      console.error("[VoiceInput] start failed:", error);
      setIsListening(false);
      Alert.alert("Voice input failed", "Unable to start voice input.");
    }
  }, [language, onTranscript]);

  return (
    <Pressable
      onPress={handleVoice}
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        marginTop: 6,
      }}
    >
      {isListening ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <MaterialIcons name="mic" size={18} color={colors.primary} />
      )}
      <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12, marginLeft: 6 }}>
        {isListening ? "Listening..." : label}
      </Text>
    </Pressable>
  );
}

