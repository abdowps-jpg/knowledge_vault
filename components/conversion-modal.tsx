import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
} from "react-native";
import { IconSymbol } from "./ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { ConversionService } from "@/lib/conversion/conversion-service";
import { Item } from "@/lib/db/schema";

interface ConversionModalProps {
  isOpen: boolean;
  item: Item | null;
  onConvert: (convertedItem: Item) => void;
  onClose: () => void;
  title?: string;
}

export function ConversionModal({
  isOpen,
  item,
  onConvert,
  onClose,
  title = "Convert Item",
}: ConversionModalProps) {
  const colors = useColors();
  const conversionService = ConversionService.getInstance();
  const [isConverting, setIsConverting] = useState(false);

  if (!item) return null;

  const conversionOptions = conversionService.getConversionOptions(item.type);

  const handleConvert = async (toType: string) => {
    setIsConverting(true);
    try {
      const converted = conversionService.convertItem(
        item,
        toType as "note" | "task" | "journal"
      );
      if (converted) {
        onConvert(converted);
        onClose();
      }
    } catch (error) {
      console.error("Error converting item:", error);
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50 justify-end">
        <View
          className="bg-surface rounded-t-3xl p-6 max-h-3/4"
          style={{ backgroundColor: colors.surface }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-xl font-bold text-foreground">{title}</Text>
            <Pressable
              onPress={onClose}
              className="p-2"
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <IconSymbol name="chevron.right" size={24} color={colors.muted} />
            </Pressable>
          </View>

          {/* Current Item Info */}
          <View className="bg-background rounded-lg p-4 mb-6">
            <Text className="text-xs text-muted mb-1">Current Type</Text>
            <Text className="text-base font-semibold text-foreground capitalize">
              {item.type}
            </Text>
            <Text className="text-sm text-muted mt-2 line-clamp-2">
              {item.title}
            </Text>
          </View>

          {/* Conversion Options */}
          <ScrollView showsVerticalScrollIndicator={false} className="mb-6">
            <Text className="text-xs font-semibold text-muted mb-3 uppercase">
              Convert To
            </Text>
            <View className="gap-3">
              {conversionOptions.map((option) => (
                <Pressable
                  key={option.type}
                  onPress={() => handleConvert(option.type)}
                  disabled={isConverting}
                  className={`p-4 rounded-lg border border-border ${
                    option.type === item.type ? "bg-primary/10" : "bg-background"
                  }`}
                  style={({ pressed }) => [
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="font-semibold text-foreground capitalize">
                        {option.label}
                      </Text>
                      <Text className="text-xs text-muted mt-1">
                        {option.description}
                      </Text>
                    </View>
                    {isConverting ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <IconSymbol
                        name="chevron.right"
                        size={20}
                        color={colors.muted}
                      />
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View className="flex-row gap-3">
            <Pressable
              onPress={onClose}
              disabled={isConverting}
              className="flex-1 py-3 rounded-lg bg-border items-center"
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <Text className="text-foreground font-semibold">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
