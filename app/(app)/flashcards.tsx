import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { ErrorState } from "@/components/error-state";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { toast } from "@/hooks/use-toast";

type Card = {
  id: string;
  question: string;
  answer: string;
  interval: number;
};

export default function FlashcardsScreen() {
  const colors = useColors();
  const dueQuery = trpc.flashcards.dueToday.useQuery({ limit: 30 });
  const statsQuery = trpc.flashcards.stats.useQuery();
  const review = trpc.flashcards.review.useMutation();
  const deleteCard = trpc.flashcards.delete.useMutation({
    onSuccess: () => {
      dueQuery.refetch().catch(() => undefined);
      statsQuery.refetch().catch(() => undefined);
    },
  });

  const [showAnswer, setShowAnswer] = React.useState(false);

  const cards = (dueQuery.data ?? []) as Card[];
  const current = cards[0];

  async function handleReview(quality: number) {
    if (!current) return;
    try {
      await review.mutateAsync({ id: current.id, quality });
      setShowAnswer(false);
      await dueQuery.refetch();
      await statsQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save review.");
    }
  }

  const stats = statsQuery.data;

  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>Flashcards</Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>
          AI-generated recall cards from your notes.
        </Text>
      </View>

      {statsQuery.data ? (
        <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
          {[
            { label: "Due", value: stats?.due ?? 0, color: colors.primary },
            { label: "Total", value: stats?.total ?? 0, color: colors.foreground },
            { label: "Mature", value: stats?.mature ?? 0, color: colors.success },
            { label: "Ease", value: stats?.averageEase ?? 0, color: colors.warning },
          ].map((s) => (
            <View
              key={s.label}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                alignItems: "center",
              }}
            >
              <Text style={{ color: s.color, fontSize: 18, fontWeight: "800" }}>{s.value}</Text>
              <Text style={{ color: colors.muted, fontSize: 10, textTransform: "uppercase", fontWeight: "700" }}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {dueQuery.isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : dueQuery.error ? (
          <ErrorState error={dueQuery.error} onRetry={() => void dueQuery.refetch()} />
        ) : !current ? (
          <View
            style={{
              padding: 32,
              borderRadius: 16,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 42 }}>🎉</Text>
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 16, marginTop: 12 }}>
              All caught up
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center", marginTop: 6 }}>
              No cards are due for review right now. Generate more from any item via the &ldquo;Recall questions&rdquo; AI action.
            </Text>
          </View>
        ) : (
          <View
            style={{
              padding: 20,
              borderRadius: 16,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>
              Question · interval {current.interval}d
            </Text>
            <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700", marginTop: 8 }}>
              {current.question}
            </Text>

            {showAnswer ? (
              <View
                style={{
                  marginTop: 16,
                  padding: 14,
                  borderRadius: 8,
                  backgroundColor: colors.background,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>
                  Answer
                </Text>
                <Text style={{ color: colors.foreground, fontSize: 14, marginTop: 6, lineHeight: 20 }}>
                  {current.answer}
                </Text>
              </View>
            ) : null}

            {!showAnswer ? (
              <Pressable
                onPress={() => setShowAnswer(true)}
                style={{
                  marginTop: 20,
                  padding: 14,
                  borderRadius: 8,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Show answer</Text>
              </Pressable>
            ) : (
              <View style={{ flexDirection: "row", gap: 6, marginTop: 20 }}>
                {[
                  { q: 0, label: "Again", color: colors.error },
                  { q: 3, label: "Hard", color: colors.warning },
                  { q: 4, label: "Good", color: colors.primary },
                  { q: 5, label: "Easy", color: colors.success },
                ].map((b) => (
                  <Pressable
                    key={b.q}
                    onPress={() => handleReview(b.q)}
                    disabled={review.isPending}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: b.color,
                      alignItems: "center",
                      opacity: review.isPending ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{b.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable
              onPress={() =>
                Alert.alert("Delete card?", "This removes the card permanently.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => deleteCard.mutate({ id: current.id }),
                  },
                ])
              }
              style={{ marginTop: 14, alignSelf: "center" }}
            >
              <Text style={{ color: colors.muted, fontSize: 11 }}>Delete card</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
