import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Stack, useRouter, useSegments } from "expo-router";
import { usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { clearToken, getStayLoggedIn, getToken, subscribeAuthToken } from "@/lib/auth-storage";
import { fullSync } from "@/lib/sync-manager";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { InboxProvider } from "@/lib/context/inbox-context";
import { LibraryProvider } from "@/lib/context/library-context";
import { ActionsProvider } from "@/lib/context/actions-context";
import { JournalProvider } from "@/lib/context/journal-context";
import { SearchProvider } from "@/lib/context/search-context";
import { requestTaskNotificationPermissions } from "@/lib/notifications/task-notifications";
import { scheduleReviewPrompts } from "@/lib/notifications/review-notifications";
import { OfflineSnapshot, offlineManager } from "@/lib/offline-manager";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(auth)",
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const syncInFlightRef = useRef(false);
  const lastSyncRunRef = useRef(0);

  const decodeBase64Url = useCallback((input: string): string | null => {
    try {
      const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
      if (typeof globalThis.atob === "function") {
        return globalThis.atob(padded);
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const isTokenExpired = useCallback((token: string): boolean => {
    try {
      const parts = token.split(".");
      if (parts.length < 2) return true;
      const decoded = decodeBase64Url(parts[1]);
      if (!decoded) return false;
      const payload = JSON.parse(decoded) as { exp?: number };
      if (!payload?.exp) return false;
      const nowInSeconds = Math.floor(Date.now() / 1000);
      return payload.exp <= nowInSeconds;
    } catch {
      return true;
    }
  }, [decodeBase64Url]);

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

  const checkAuth = useCallback(async () => {
    try {
      console.log("Checking authentication...");
      console.log("[Auth/Layout] Checking auth state...");
      const token = await getToken();
      console.log("[Auth/Layout] Startup token:", token ? "present" : "missing");

      if (!token) {
        setIsAuthenticated(false);
        console.log("Is authenticated:", false);
        return;
      }

      if (isTokenExpired(token)) {
        console.log("[Auth/Layout] Token is expired/invalid, clearing token");
        await clearToken();
        setIsAuthenticated(false);
        setSessionExpired(true);
        console.log("Is authenticated:", false);
        return;
      }

      const stayLoggedIn = await getStayLoggedIn();
      if (!stayLoggedIn) {
        console.log("[Auth/Layout] stayLoggedIn is false, clearing token");
        await clearToken();
        setIsAuthenticated(false);
        console.log("Is authenticated:", false);
        return;
      }

      setIsAuthenticated(true);
      console.log("Is authenticated:", true);
      setSessionExpired((prev) => (prev ? false : prev));
    } catch (error) {
      console.error("[Auth/Layout] Failed loading auth state:", error);
      setIsAuthenticated(false);
      console.log("Is authenticated:", false);
    } finally {
      setIsLoading(false);
    }
  }, [isTokenExpired]);

  useEffect(() => {
    checkAuth().catch((error) => {
      console.error("[Auth/Layout] checkAuth failed:", error);
      setIsLoading(false);
      setIsAuthenticated(false);
    });
  }, [checkAuth]);

  useEffect(() => {
    const unsubscribe = subscribeAuthToken((token) => {
      setIsAuthenticated(Boolean(token));
      if (!token) {
        setSessionExpired(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    console.log("[Auth] isAuthenticated:", isAuthenticated);
    console.log("[Auth] isLoading:", isLoading);
    console.log("[Auth] segments:", segments);
    console.log("[Auth] pathname:", pathname);
  }, [isAuthenticated, isLoading, pathname, segments]);

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
      scheduleReviewPrompts().catch((error) => {
        console.error("Review notification scheduling failed:", error);
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
  useEffect(() => {
    configureTRPCAuth({
      getToken,
      onUnauthorized: async () => {
        console.warn("[Auth/Layout] Received 401, clearing session");
        await clearToken();
        setIsAuthenticated(false);
        setSessionExpired(true);
      },
    });
  }, []);

  // Keep a stable client instance; auth headers are resolved per request in lib/trpc.ts.
  const [trpcClient] = useState(() => createTRPCClient());

  useEffect(() => {
    if (offlineSnapshot.status === "synced") {
      queryClient.invalidateQueries().catch(() => undefined);
    }
  }, [offlineSnapshot.status, queryClient]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const runSync = (force = false) => {
      const now = Date.now();
      if (syncInFlightRef.current) return;
      if (!force && now - lastSyncRunRef.current < 15_000) return;

      syncInFlightRef.current = true;
      lastSyncRunRef.current = now;
      fullSync()
        .catch((error) => {
          console.error("Background sync failed:", error);
        })
        .finally(() => {
          syncInFlightRef.current = false;
        });
    };

    runSync(true);
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
  }, [isAuthenticated]);

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

  const RootContainer = Platform.OS === "web" ? View : GestureHandlerRootView;

  const content = (
    <RootContainer style={{ flex: 1 }}>
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
    </RootContainer>
  );

  if (!onboardingChecked || isLoading) {
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

  if (!hasSeenOnboarding && pathname !== "/onboarding") {
    console.log("[Auth/Layout] Onboarding not completed, but auth flow takes priority");
  }

  const firstSegment = String(segments[0] ?? "");
  const inAuthGroup = firstSegment === "(auth)";
  const inPublicRoute = firstSegment === "public";
  if (!isAuthenticated && !inAuthGroup && !inPublicRoute) {
    console.log("[Auth/Layout] Redirecting unauthenticated user to login");
    console.log("Redirecting to:", "auth");
    return <Redirect href={"/(auth)/login" as any} />;
  }
  if (isAuthenticated && inAuthGroup) {
    console.log("[Auth/Layout] Redirecting authenticated user to app tabs");
    console.log("Redirecting to:", "tabs");
    return <Redirect href={"/(app)/(tabs)" as any} />;
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
