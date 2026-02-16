import React, { useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

const ONBOARDING_KEY = "hasSeenOnboarding";

type Slide = {
  id: string;
  title: string;
  subtitle?: string;
  content?: React.ReactNode;
};

function FeatureRow({ icon, label, description }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; description: string }) {
  const colors = useColors();
  return (
    <View className="flex-row items-start mb-4">
      <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: colors.surface }}>
        <MaterialIcons name={icon} size={20} color={colors.primary} />
      </View>
      <View className="flex-1">
        <Text className="text-foreground font-semibold">{label}</Text>
        <Text className="text-muted text-sm">{description}</Text>
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const colors = useColors();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const slides: Slide[] = [
    {
      id: "welcome",
      title: "Welcome to Knowledge Vault",
      subtitle: "Your personal knowledge management system",
      content: (
        <View className="items-center">
          <View className="w-24 h-24 rounded-full items-center justify-center mb-6" style={{ backgroundColor: colors.primary }}>
            <MaterialIcons name="auto-stories" size={46} color="white" />
          </View>
        </View>
      ),
    },
    {
      id: "features",
      title: "Everything in One Place",
      subtitle: "Capture and organize your daily knowledge",
      content: (
        <View className="w-full mt-3">
          <FeatureRow icon="description" label="Notes" description="Save ideas and references quickly." />
          <FeatureRow icon="check-circle" label="Tasks" description="Track priorities and stay focused." />
          <FeatureRow icon="menu-book" label="Journal" description="Write entries and build habits." />
          <FeatureRow icon="search" label="Search" description="Find anything instantly across content." />
        </View>
      ),
    },
    {
      id: "quick-start",
      title: "Quick Start",
      subtitle: "Get productive in seconds",
      content: (
        <View className="w-full mt-4">
          <Text className="text-foreground text-base mb-3">• Tap + to add your first note</Text>
          <Text className="text-foreground text-base mb-3">• Organize in Library</Text>
          <Text className="text-foreground text-base mb-3">• Track tasks in Actions</Text>
        </View>
      ),
    },
    {
      id: "get-started",
      title: "Get Started",
      subtitle: "You can begin now and connect account later",
      content: <View className="h-2" />,
    },
  ];

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && typeof viewableItems[0].index === "number") {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  const goNext = () => {
    const next = Math.min(slides.length - 1, activeIndex + 1);
    listRef.current?.scrollToIndex({ index: next, animated: true });
  };

  const finishOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    router.replace("/(tabs)");
  };

  const handleCreateAccount = async () => {
    Alert.alert("Coming Soon", "Account creation will be available in a future update.");
    await finishOnboarding();
  };

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item }) => (
          <View style={{ width }} className="px-6 pt-16">
            <Text className="text-3xl font-bold text-foreground text-center">{item.title}</Text>
            {item.subtitle ? (
              <Text className="text-muted text-center mt-3 mb-6">{item.subtitle}</Text>
            ) : null}
            {item.content}

            {item.id === "get-started" ? (
              <View className="mt-8 gap-3">
                <Pressable
                  onPress={handleCreateAccount}
                  style={{
                    backgroundColor: colors.primary,
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: "center",
                  }}
                >
                  <Text className="text-white font-semibold">Create Account</Text>
                </Pressable>
                <Pressable
                  onPress={finishOnboarding}
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingVertical: 12,
                    alignItems: "center",
                  }}
                >
                  <Text className="text-foreground font-semibold">Continue Without Account</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
      />

      <View className="px-6 pb-10">
        <View className="flex-row justify-center mb-6">
          {slides.map((slide, idx) => (
            <View
              key={slide.id}
              style={{
                width: idx === activeIndex ? 20 : 8,
                height: 8,
                borderRadius: 999,
                marginHorizontal: 4,
                backgroundColor: idx === activeIndex ? colors.primary : colors.border,
              }}
            />
          ))}
        </View>

        {activeIndex < slides.length - 1 ? (
          <Pressable
            onPress={goNext}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text className="text-white font-semibold">Next</Text>
          </Pressable>
        ) : null}
      </View>
    </ScreenContainer>
  );
}
