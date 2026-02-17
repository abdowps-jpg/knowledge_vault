import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { AppState, Platform, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient, configureTRPCAuth } from "@/lib/trpc";
import { clearToken, getStayLoggedIn, getToken } from "@/lib/auth-storage";
import { fullSync } from "@/lib/sync-manager";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { InboxProvider } from "@/lib/context/inbox-context";
import { LibraryProvider } from "@/lib/context/library-context";
import { ActionsProvider } from "@/lib/context/actions-context";
import { JournalProvider } from "@/lib/context/journal-context";
import { SearchProvider } from "@/lib/context/search-context";
import { requestTaskNotificationPermissions } from "@/lib/notifications/task-notifications";
import { OfflineSnapshot, offlineManager } from "@/lib/offline-manager";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(app)",
};

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);
  const [offlineSnapshot, setOfflineSnapshot] = useState<OfflineSnapshot>(
    offlineManager.getSnapshot()
  );
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  useEffect(() => {
    offlineManager.initialize().catch((error) => {
      console.error("Failed initializing offline manager:", error);
    });
    const unsubscribe = offlineManager.subscribe(setOfflineSnapshot);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const value = await AsyncStorage.getItem("hasSeenOnboarding");
        setHasSeenOnboarding(value === "true");
      } catch (error) {
        console.error("Failed reading onboarding status:", error);
        setHasSeenOnboarding(true);
      } finally {
        setOnboardingChecked(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!onboardingChecked) return;
    if (!hasSeenOnboarding) {
      AsyncStorage.getItem("hasSeenOnboarding")
        .then((value) => {
          if (value === "true") {
            setHasSeenOnboarding(true);
            return;
          }
          if (pathname !== "/onboarding") {
            router.replace("/onboarding");
          }
        })
        .catch(() => {
          if (pathname !== "/onboarding") {
            router.replace("/onboarding");
          }
        });
    }
  }, [onboardingChecked, hasSeenOnboarding, pathname, router]);

  useEffect(() => {
    (async () => {
      try {
        const stayLoggedIn = await getStayLoggedIn();
        const token = await getToken();
        if (!token) {
          setAuthenticated(false);
          setAuthChecked(true);
          return;
        }
        if (!stayLoggedIn) {
          await clearToken();
          setAuthenticated(false);
          setAuthChecked(true);
          return;
        }
        setAuthenticated(true);
      } catch (error) {
        console.error("Failed loading auth state:", error);
        setAuthenticated(false);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!onboardingChecked || !authChecked || !hasSeenOnboarding) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (authenticated && sessionExpired) {
      setSessionExpired(false);
    }

    if (!authenticated && !inAuthGroup) {
      router.replace("/(auth)/login" as any);
      return;
    }

    if (authenticated && inAuthGroup) {
      router.replace("/(app)/(tabs)" as any);
    }
  }, [authChecked, authenticated, hasSeenOnboarding, onboardingChecked, router, segments, sessionExpired]);

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }
    let isActive = true;
    let removeListener: (() => void) | null = null;

    (async () => {
      const Notifications = await import("expo-notifications");
      if (!isActive) return;

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      requestTaskNotificationPermissions().catch((error) => {
        console.error("Notification permission request failed:", error);
      });

      const handleTaskNavigation = (taskId?: string) => {
        if (!taskId) return;
        router.push({
          pathname: "/(app)/(tabs)/actions",
          params: { taskId },
        });
      };

      const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as { taskId?: string } | undefined;
        handleTaskNavigation(data?.taskId);
      });
      removeListener = () => responseSub.remove();

      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          const data = response?.notification.request.content.data as { taskId?: string } | undefined;
          handleTaskNavigation(data?.taskId);
        })
        .catch((error) => {
          console.error("Failed reading last notification response:", error);
        });
    })().catch((error) => {
      console.error("Notification initialization failed:", error);
    });

    return () => {
      isActive = false;
      removeListener?.();
    };
  }, [router]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
            // Cache tuning for smoother navigation and fewer refetches
            staleTime: 30_000,
            gcTime: 5 * 60_000,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => {
    configureTRPCAuth({
      getToken,
      onUnauthorized: async () => {
        await clearToken();
        setAuthenticated(false);
        setSessionExpired(true);
      },
    });
    return createTRPCClient();
  });

  useEffect(() => {
    if (offlineSnapshot.status === "synced") {
      queryClient.invalidateQueries().catch(() => undefined);
    }
  }, [offlineSnapshot.status, queryClient]);

  useEffect(() => {
    if (!authenticated) return;

    const runSync = () => {
      fullSync().catch((error) => {
        console.error("Background sync failed:", error);
      });
    };

    const interval = setInterval(runSync, 5 * 60 * 1000);
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") runSync();
    });
    const netUnsub = NetInfo.addEventListener((state) => {
      if (state.isConnected) runSync();
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
      netUnsub();
    };
  }, [authenticated]);

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const statusVisual =
    offlineSnapshot.status === "synced"
      ? { icon: "✅", color: "#22c55e", label: "Synced" }
      : offlineSnapshot.status === "syncing"
      ? { icon: "🔄", color: "#3b82f6", label: "Syncing" }
      : offlineSnapshot.status === "offline"
      ? { icon: "⚠️", color: "#eab308", label: "Offline" }
      : { icon: "❌", color: "#ef4444", label: "Sync Failed" };

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {/* Default to hiding native headers so raw route segments don't appear (e.g. "(tabs)", "products/[id]"). */}
          {/* If a screen needs the native header, explicitly enable it and set a human title via Stack.Screen options. */}
          {/* in order for ios apps tab switching to work properly, use presentation: "fullScreenModal" for login page, whenever you decide to use presentation: "modal*/}
          <InboxProvider>
            <LibraryProvider>
              <ActionsProvider>
                <JournalProvider>
                  <SearchProvider>
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="onboarding" />
                      <Stack.Screen name="(auth)" />
                      <Stack.Screen name="(app)" />
                      <Stack.Screen name="oauth/callback" />
                    </Stack>
                  </SearchProvider>
                </JournalProvider>
              </ActionsProvider>
            </LibraryProvider>
          </InboxProvider>
          <StatusBar style="auto" />
        </QueryClientProvider>
      </trpc.Provider>

      {!offlineSnapshot.isOnline ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            paddingTop: Math.max(insets.top, 10),
            paddingHorizontal: 12,
            paddingBottom: 8,
            backgroundColor: "#f59e0b",
            zIndex: 120,
          }}
        >
          <Text style={{ color: "#111827", textAlign: "center", fontWeight: "600", fontSize: 12 }}>
            You're offline. Changes will sync when online.
          </Text>
        </View>
      ) : null}

      {sessionExpired ? (
        <View
          style={{
            position: "absolute",
            top: Math.max(insets.top, 10),
            left: 12,
            right: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: "#ef4444",
            borderRadius: 10,
            zIndex: 130,
          }}
        >
          <Text style={{ color: "white", textAlign: "center", fontWeight: "700", fontSize: 12 }}>
            Session expired. Please login again.
          </Text>
        </View>
      ) : null}

      <View
        style={{
          pointerEvents: "none",
          position: "absolute",
          top: Math.max(insets.top + (offlineSnapshot.isOnline ? 8 : 44), 12),
          right: 12,
          borderRadius: 999,
          backgroundColor: "#ffffffee",
          borderWidth: 1,
          borderColor: `${statusVisual.color}55`,
          paddingHorizontal: 10,
          paddingVertical: 6,
          zIndex: 121,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Text style={{ marginRight: 6 }}>{statusVisual.icon}</Text>
        <Text style={{ color: "#111827", fontSize: 12, fontWeight: "600" }}>
          {statusVisual.label}
          {offlineSnapshot.status === "syncing"
            ? ` ${offlineSnapshot.syncProgress.done}/${offlineSnapshot.syncProgress.total}`
            : ""}
        </Text>
      </View>
    </GestureHandlerRootView>
  );

  if (!onboardingChecked || !authChecked) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text>Loading...</Text>
          </View>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
