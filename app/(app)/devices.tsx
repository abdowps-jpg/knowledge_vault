import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { trpc } from "@/lib/trpc";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

export default function DevicesScreen() {
  const colors = useColors();
  const router = useRouter();
  const utils = trpc.useUtils();
  const devicesQuery = trpc.devices.list.useQuery();
  const signOutDevice = trpc.devices.signOutDevice.useMutation({
    onSuccess: () => utils.devices.list.invalidate(),
  });
  const signOutAll = trpc.devices.signOutAllDevices.useMutation({
    onSuccess: () => utils.devices.list.invalidate(),
  });

  if (devicesQuery.isLoading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  const devices = devicesQuery.data ?? [];

  return (
    <ScreenContainer>
      <View className="px-4 py-4 border-b border-border flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Pressable onPress={() => router.back()} className="mr-3">
            <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
          <Text className="text-2xl font-bold text-foreground">Devices</Text>
        </View>
        <Pressable onPress={() => signOutAll.mutate()} className="bg-red-500 rounded-lg px-3 py-2">
          <Text className="text-white text-xs font-semibold">Sign Out All</Text>
        </Pressable>
      </View>
      <ScrollView className="flex-1 p-4">
        {devices.map((device) => (
          <View key={device.id} className="bg-surface border border-border rounded-xl p-4 mb-3">
            <Text className="text-foreground font-semibold">{device.deviceName}</Text>
              <Text className="text-muted text-xs mt-1">
              {device.platform} • Last active {device.lastActiveAt ? new Date(device.lastActiveAt).toLocaleString() : "Unknown"}
            </Text>
            <View className="flex-row items-center justify-between mt-3">
              <Text className="text-xs text-muted">{device.isActive ? "Active" : "Signed out"}</Text>
              <Pressable onPress={() => signOutDevice.mutate({ id: device.id })} className="bg-border rounded-lg px-3 py-2">
                <Text className="text-foreground text-xs font-semibold">Sign Out Device</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
