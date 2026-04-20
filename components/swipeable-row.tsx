import React, { useRef } from "react";
import { Pressable } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

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
  const swipeableRef = useRef<React.ComponentRef<typeof ReanimatedSwipeable>>(null);

  const renderSide = (action: SwipeAction, side: "left" | "right") => () =>
    (
      <RenderAction
        action={{
          ...action,
          onPress: () => {
            swipeableRef.current?.close();
            action.onPress();
          },
        }}
        side={side}
      />
    );

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      renderLeftActions={leftAction ? renderSide(leftAction, "left") : undefined}
      renderRightActions={rightAction ? renderSide(rightAction, "right") : undefined}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
