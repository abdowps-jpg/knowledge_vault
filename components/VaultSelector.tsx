import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

interface VaultSelectorProps {
  value: string | undefined;
  onChange: (vaultId: string | undefined) => void;
  disabled?: boolean;
  label?: string;
}

export function VaultSelector({ value, onChange, disabled, label = "Vault" }: VaultSelectorProps) {
  const colors = useColors();
  const { data: vaults, isLoading } = trpc.vaults.listMine.useQuery();

  const options: { id: string | undefined; name: string }[] = [
    { id: undefined, name: "Personal" },
    ...(vaults ?? []).map((v) => ({ id: v.id, name: v.name })),
  ];

  return (
    <View style={{ marginBottom: 12 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: colors.foreground,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
      >
        {isLoading && options.length === 1 ? (
          <Text style={{ color: colors.muted, fontSize: 12 }}>Loading…</Text>
        ) : null}
        {options.map((opt) => {
          const selected = (value ?? undefined) === opt.id;
          return (
            <Pressable
              key={opt.id ?? "__personal__"}
              onPress={() => {
                if (disabled) return;
                onChange(opt.id);
              }}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.primary : colors.background,
                opacity: disabled ? 0.5 : 1,
              }}
              accessibilityRole="button"
              accessibilityLabel={`Select vault ${opt.name}`}
              accessibilityState={{ selected, disabled }}
            >
              <Text
                style={{
                  color: selected ? "#ffffff" : colors.foreground,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {opt.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
