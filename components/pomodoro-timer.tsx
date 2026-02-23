import React from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

type Phase = "work" | "shortBreak" | "longBreak";

const DURATIONS: Record<Phase, number> = {
  work: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

const PHASE_LABELS: Record<Phase, string> = {
  work: "Work",
  shortBreak: "Short Break",
  longBreak: "Long Break",
};

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function PomodoroTimer() {
  const colors = useColors();
  const [phase, setPhase] = React.useState<Phase>("work");
  const [remainingSeconds, setRemainingSeconds] = React.useState(DURATIONS.work);
  const [isRunning, setIsRunning] = React.useState(false);
  const [completedWorkSessions, setCompletedWorkSessions] = React.useState(0);
  const [schedulingNotification, setSchedulingNotification] = React.useState(false);
  const notificationIdRef = React.useRef<string | null>(null);

  const clearCompletionNotification = React.useCallback(async () => {
    if (Platform.OS === "web") return;
    if (!notificationIdRef.current) return;
    try {
      const Notifications = await import("expo-notifications");
      await Notifications.cancelScheduledNotificationAsync(notificationIdRef.current);
      notificationIdRef.current = null;
    } catch (error) {
      console.error("[Pomodoro] Failed canceling notification:", error);
    }
  }, []);

  const scheduleCompletionNotification = React.useCallback(async () => {
    if (Platform.OS === "web") return;
    try {
      setSchedulingNotification(true);
      const Notifications = await import("expo-notifications");
      await clearCompletionNotification();
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "Pomodoro completed",
          body: `${PHASE_LABELS[phase]} finished. Continue your flow.`,
          data: { type: "pomodoro", phase },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(Date.now() + remainingSeconds * 1000),
        },
      });
      notificationIdRef.current = id;
    } catch (error) {
      console.error("[Pomodoro] Failed scheduling notification:", error);
    } finally {
      setSchedulingNotification(false);
    }
  }, [clearCompletionNotification, phase, remainingSeconds]);

  React.useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) return 0;
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  React.useEffect(() => {
    if (!isRunning) {
      clearCompletionNotification().catch(() => undefined);
      return;
    }
    scheduleCompletionNotification().catch(() => undefined);
  }, [clearCompletionNotification, isRunning, scheduleCompletionNotification]);

  React.useEffect(() => {
    if (remainingSeconds > 0 || !isRunning) return;

    const finishPhase = async () => {
      try {
        await clearCompletionNotification();
        if (phase === "work") {
          const nextCount = completedWorkSessions + 1;
          setCompletedWorkSessions(nextCount);
          const nextPhase: Phase = nextCount % 4 === 0 ? "longBreak" : "shortBreak";
          setPhase(nextPhase);
          setRemainingSeconds(DURATIONS[nextPhase]);
          Alert.alert("Work session complete", `Starting ${PHASE_LABELS[nextPhase].toLowerCase()}.`);
          setIsRunning(false);
          return;
        }

        setPhase("work");
        setRemainingSeconds(DURATIONS.work);
        Alert.alert("Break complete", "Ready for the next work session.");
        setIsRunning(false);
      } catch (error) {
        console.error("[Pomodoro] Phase transition failed:", error);
        setIsRunning(false);
      }
    };

    finishPhase().catch((error) => {
      console.error("[Pomodoro] Unexpected completion error:", error);
      setIsRunning(false);
    });
  }, [clearCompletionNotification, completedWorkSessions, isRunning, phase, remainingSeconds]);

  const handleReset = async () => {
    try {
      await clearCompletionNotification();
      setIsRunning(false);
      setRemainingSeconds(DURATIONS[phase]);
    } catch (error) {
      console.error("[Pomodoro] Reset failed:", error);
    }
  };

  const handleSkip = async () => {
    try {
      await clearCompletionNotification();
      setIsRunning(false);
      if (phase === "work") {
        const nextCount = completedWorkSessions + 1;
        setCompletedWorkSessions(nextCount);
        const nextPhase: Phase = nextCount % 4 === 0 ? "longBreak" : "shortBreak";
        setPhase(nextPhase);
        setRemainingSeconds(DURATIONS[nextPhase]);
      } else {
        setPhase("work");
        setRemainingSeconds(DURATIONS.work);
      }
    } catch (error) {
      console.error("[Pomodoro] Skip failed:", error);
    }
  };

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        backgroundColor: colors.surface,
        padding: 12,
      }}
    >
      <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>Pomodoro Timer</Text>
      <Text style={{ color: colors.muted, marginTop: 4 }}>
        {PHASE_LABELS[phase]} • {completedWorkSessions} completed work sessions
      </Text>
      <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 28, marginTop: 8 }}>
        {formatTime(remainingSeconds)}
      </Text>

      <View style={{ flexDirection: "row", marginTop: 10 }}>
        <Pressable
          onPress={() => setIsRunning((prev) => !prev)}
          style={{
            marginRight: 8,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: colors.primary,
            opacity: schedulingNotification ? 0.7 : 1,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>{isRunning ? "Pause" : "Start"}</Text>
        </Pressable>

        <Pressable
          onPress={handleReset}
          style={{
            marginRight: 8,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          <Text style={{ color: colors.foreground, fontWeight: "700" }}>Reset</Text>
        </Pressable>

        <Pressable
          onPress={handleSkip}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          <Text style={{ color: colors.foreground, fontWeight: "700" }}>Skip</Text>
        </Pressable>
      </View>
      {schedulingNotification ? (
        <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center" }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.muted, marginLeft: 8, fontSize: 12 }}>Scheduling background alert...</Text>
        </View>
      ) : null}
    </View>
  );
}
