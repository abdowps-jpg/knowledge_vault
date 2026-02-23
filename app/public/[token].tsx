import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";

export default function PublicItemScreen() {
  const colors = useColors();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [password, setPassword] = React.useState("");
  const [submittedPassword, setSubmittedPassword] = React.useState<string | undefined>(undefined);

  const query = trpc.publicLinks.getPublic.useQuery(
    { token: token || "", password: submittedPassword },
    {
      enabled: Boolean(token),
      retry: false,
    }
  );

  const isPasswordRequired =
    query.error?.message?.toLowerCase().includes("password required") ||
    query.error?.message?.toLowerCase().includes("invalid password");

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "800" }}>Shared Note</Text>
      </View>
      {query.isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : query.error ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: "#DC2626", fontWeight: "700", marginBottom: 10 }}>{query.error.message}</Text>
          {isPasswordRequired ? (
            <View>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter link password"
                placeholderTextColor={colors.muted}
                secureTextEntry
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 8,
                  color: colors.foreground,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  marginBottom: 10,
                }}
              />
              <Pressable
                onPress={() => setSubmittedPassword(password)}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 8,
                  alignItems: "center",
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>Unlock</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : query.data ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "800", marginBottom: 8 }}>
            {query.data.item.title}
          </Text>
          {query.data.owner.username || query.data.owner.email ? (
            <Text style={{ color: colors.muted, marginBottom: 12 }}>
              by {query.data.owner.username || query.data.owner.email}
            </Text>
          ) : null}
          {query.data.item.url ? (
            <Text style={{ color: colors.primary, marginBottom: 12 }}>{query.data.item.url}</Text>
          ) : null}
          <Text style={{ color: colors.foreground, fontSize: 16, lineHeight: 24 }}>
            {query.data.item.content || "No content"}
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}
