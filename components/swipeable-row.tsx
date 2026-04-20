import React, { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/use-colors";

interface SwipeAction {
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  backgroundColor: string;
  onPress: () => void;
}

interface SwipeableRowProps {
  children: React.ReactNode;
  leftAction?: SwipeAction;
  rightAction?: SwipeAction;
}

function RenderAction({ action, side }: { action: SwipeAction; side: "left" | "right" }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        action.onPress();
      }}
      style={{
        backgroundColor: action.backgroundColor,
        justifyContent: "center",
        alignItems: side === "left" ? "flex-start" : "flex-end",
        paddingHorizontal: 24,
        width: 80,
      }}
    >
      <MaterialIcons name={action.icon} size={24} color={action.color} />
    </Pressable>
  );
}

export function SwipeableRow({ children, leftAction, rightAction }: SwipeableRowProps) {
  const swipeableRef = useRef<any>(null);

  const close = () => swipeableRef.current?.close();

  const renderLeftActions = leftAction
    ? () => (
        <RenderAction
          action={{
            ...leftAction,
            onPress: () => {
              close();
              leftAction.onPress();
            },
          }}
          side="left"
        />
      )
    : undefined;

  const renderRightActions = rightAction
    ? () => (
        <RenderAction
          action={{
            ...rightAction,
            onPress: () => {
              close();
              rightAction.onPress();
            },
          }}
          side="right"
        />
      )
    : undefined;

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
