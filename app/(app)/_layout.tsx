import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="item/[id]" />
      <Stack.Screen name="stats" />
      <Stack.Screen name="analytics" />
      <Stack.Screen name="devices" />
      <Stack.Screen name="conflicts" />
      <Stack.Screen name="ai-features" />
    </Stack>
  );
}
