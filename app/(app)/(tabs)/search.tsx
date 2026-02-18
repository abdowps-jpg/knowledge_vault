import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { MaterialIcons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { ErrorState } from "@/components/error-state";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type FilterType = "all" | "notes" | "tasks" | "journal";
type ResultType = "notes" | "tasks" | "journal";

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  content: string;
  createdAt: Date;
  score: number;
  raw: any;
}

type SearchListRow =
  | { kind: "header"; key: string; label: string; icon: "description" | "check-circle" | "menu-book"; count: number }
  | { kind: "result"; key: string; result: SearchResult };

function parseDate(value: unknown): Date {
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) {
    return new Date(0);
  }
  return date;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countMatches(text: string, term: string): number {
  if (!term.trim()) return 0;
  const normalizedText = text.toLowerCase();
  const normalizedTerm = term.toLowerCase();
  let count = 0;
  let index = 0;

  while (true) {
    const found = normalizedText.indexOf(normalizedTerm, index);
    if (found === -1) break;
    count += 1;
    index = found + normalizedTerm.length;
  }

  return count;
}

function HighlightedText({
  text,
  term,
  textClassName,
}: {
  text: string;
  term: string;
  textClassName?: string;
}) {
  const colors = useColors();
  const query = term.trim();

  if (!query) {
    return <Text className={textClassName}>{text}</Text>;
  }

  const pattern = new RegExp(`(${escapeRegex(query)})`, "ig");
  const parts = text.split(pattern);

  return (
    <Text className={textClassName}>
      {parts.map((part, index) => {
        const isMatch = part.toLowerCase() === query.toLowerCase();
        return (
          <Text
            key={`${part}-${index}`}
            style={
              isMatch
                ? {
                    color: colors.primary,
                    fontWeight: "700",
                  }
                : undefined
            }
          >
            {part}
          </Text>
        );
      })}
    </Text>
  );
}

export default function SearchScreen() {
  const colors = useColors();
  const [activeFilter, setActiveFilter] = React.useState<FilterType>("all");
  const [searchText, setSearchText] = React.useState("");
  const [debouncedSearchText, setDebouncedSearchText] = React.useState("");
  const [selectedResult, setSelectedResult] = React.useState<SearchResult | null>(null);

  const itemsQuery = trpc.items.list.useInfiniteQuery(
    { limit: 25 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );
  const tasksQuery = trpc.tasks.list.useInfiniteQuery(
    { sortOrder: "desc", limit: 25 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );
  const journalQuery = trpc.journal.list.useInfiniteQuery(
    { limit: 25 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const isLoading = itemsQuery.isLoading || tasksQuery.isLoading || journalQuery.isLoading;
  const error = itemsQuery.error || tasksQuery.error || journalQuery.error;

  React.useEffect(() => {
    if (error) {
      console.error("Search query failed:", error);
    }
  }, [error]);

  const retryAll = async () => {
    await Promise.all([itemsQuery.refetch(), tasksQuery.refetch(), journalQuery.refetch()]);
  };

  const combinedResults = React.useMemo(() => {
    const term = debouncedSearchText.trim();
    if (!term) return [] as SearchResult[];

    const items = itemsQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [];
    const tasks = tasksQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [];
    const journals = journalQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [];

    const itemResults: SearchResult[] = items
      .map((item) => {
        const title = item.title || "";
        const content = item.content || "";
        const score = countMatches(title, term) * 3 + countMatches(content, term);
        if (score === 0) return null;
        return {
          id: item.id,
          type: "notes",
          title: title || "Untitled Note",
          content,
          createdAt: parseDate(item.createdAt),
          score,
          raw: item,
        };
      })
      .filter(Boolean) as SearchResult[];

    const taskResults: SearchResult[] = tasks
      .map((task) => {
        const title = task.title || "";
        const content = task.description || "";
        const score = countMatches(title, term) * 3 + countMatches(content, term);
        if (score === 0) return null;
        return {
          id: task.id,
          type: "tasks",
          title: title || "Untitled Task",
          content,
          createdAt: parseDate(task.createdAt),
          score,
          raw: task,
        };
      })
      .filter(Boolean) as SearchResult[];

    const journalResults: SearchResult[] = journals
      .map((entry) => {
        const title = entry.title || "";
        const content = entry.content || "";
        const score = countMatches(title, term) * 3 + countMatches(content, term);
        if (score === 0) return null;
        return {
          id: entry.id,
          type: "journal",
          title: title || "Untitled Entry",
          content,
          createdAt: parseDate(entry.createdAt),
          score,
          raw: entry,
        };
      })
      .filter(Boolean) as SearchResult[];

    const merged = [...itemResults, ...taskResults, ...journalResults];

    return merged.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }, [debouncedSearchText, itemsQuery.data, tasksQuery.data, journalQuery.data]);

  const filteredResults = React.useMemo(() => {
    if (activeFilter === "all") return combinedResults;
    return combinedResults.filter((result) => result.type === activeFilter);
  }, [combinedResults, activeFilter]);

  const groupedResults = React.useMemo(() => {
    return {
      notes: filteredResults.filter((result) => result.type === "notes"),
      tasks: filteredResults.filter((result) => result.type === "tasks"),
      journal: filteredResults.filter((result) => result.type === "journal"),
    };
  }, [filteredResults]);
  const listRows = React.useMemo(() => {
    const rows: SearchListRow[] = [];
    const sections: Array<{ key: ResultType; label: string; icon: "description" | "check-circle" | "menu-book"; data: SearchResult[] }> = [
      { key: "notes", label: "Notes", icon: "description", data: groupedResults.notes },
      { key: "tasks", label: "Tasks", icon: "check-circle", data: groupedResults.tasks },
      { key: "journal", label: "Journal", icon: "menu-book", data: groupedResults.journal },
    ];

    for (const section of sections) {
      if (!section.data.length) continue;
      rows.push({
        kind: "header",
        key: `header-${section.key}`,
        label: section.label,
        icon: section.icon,
        count: section.data.length,
      });
      for (const result of section.data) {
        rows.push({
          kind: "result",
          key: `${result.type}-${result.id}`,
          result,
        });
      }
    }

    return rows;
  }, [groupedResults]);

  const hasNextPage = Boolean(itemsQuery.hasNextPage || tasksQuery.hasNextPage || journalQuery.hasNextPage);
  const isFetchingNextPage = Boolean(
    itemsQuery.isFetchingNextPage || tasksQuery.isFetchingNextPage || journalQuery.isFetchingNextPage
  );

  return (
    <ScreenContainer>
      <View className="p-4 border-b border-border">
        <View className="flex-row items-center mb-3">
          <MaterialIcons name="search" size={32} color={colors.primary} />
          <Text className="text-2xl font-bold text-foreground ml-2">Search</Text>
        </View>

        <View className="flex-row items-center bg-surface rounded-lg border border-border px-3 py-2">
          <MaterialIcons name="search" size={20} color={colors.muted} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search notes, tasks, journal..."
            placeholderTextColor={colors.muted}
            className="flex-1 ml-2 text-foreground"
            style={{ color: colors.foreground, fontSize: 16 }}
          />
          {searchText.length > 0 ? (
            <Pressable onPress={() => setSearchText("")}>
              <MaterialIcons name="close" size={20} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", zIndex: 5, elevation: 5 }}>
            {[
              { label: "All", value: "all" as const },
              { label: "Notes", value: "notes" as const },
              { label: "Tasks", value: "tasks" as const },
              { label: "Journal", value: "journal" as const },
            ].map((chip) => (
              <Pressable
                key={chip.value}
                onPress={() => {
                  console.log("[Search] Filter pressed:", chip.value);
                  setActiveFilter(chip.value);
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  marginRight: 8,
                  marginBottom: 8,
                  alignSelf: "flex-start",
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: activeFilter === chip.value ? colors.primary : colors.surface,
                }}
              >
                <Text style={{ color: activeFilter === chip.value ? "white" : colors.foreground, fontSize: 13, fontWeight: "600" }}>
                  {chip.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 p-4">
          <View className="items-center mt-8">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-muted mt-4">Loading...</Text>
          </View>
        </View>
      ) : error ? (
        <View className="flex-1 p-4">
          <ErrorState error={error} onRetry={retryAll} />
        </View>
      ) : debouncedSearchText.trim().length === 0 ? (
        <View className="flex-1 p-4">
          <View className="items-center justify-center mt-8">
            <MaterialIcons name="search" size={64} color={colors.muted} />
            <Text className="text-muted text-center mt-4">Start typing to search</Text>
          </View>
        </View>
      ) : filteredResults.length === 0 ? (
        <View className="flex-1 p-4">
          <View className="items-center justify-center mt-8">
            <MaterialIcons name="search-off" size={64} color={colors.muted} />
            <Text className="text-muted text-center mt-4">No results found</Text>
          </View>
        </View>
      ) : (
        <FlashList
          data={listRows}
          estimatedItemSize={112}
          keyExtractor={(row: SearchListRow) => row.key}
          contentContainerStyle={{ padding: 16 }}
          onEndReachedThreshold={0.35}
          onEndReached={() => {
            if (!hasNextPage || isFetchingNextPage) return;
            Promise.all([
              itemsQuery.hasNextPage ? itemsQuery.fetchNextPage() : Promise.resolve(),
              tasksQuery.hasNextPage ? tasksQuery.fetchNextPage() : Promise.resolve(),
              journalQuery.hasNextPage ? journalQuery.fetchNextPage() : Promise.resolve(),
            ]).catch((err) => console.error("Search pagination failed:", err));
          }}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View className="py-4">
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
          renderItem={({ item: row }: { item: SearchListRow }) => {
            if (row.kind === "header") {
              return (
                <View className="flex-row items-center mb-2 mt-2">
                  <MaterialIcons name={row.icon} size={18} color={colors.primary} />
                  <Text className="text-sm font-semibold text-foreground ml-2">
                    {row.label} ({row.count})
                  </Text>
                </View>
              );
            }

            return (
              <Pressable onPress={() => setSelectedResult(row.result)}>
                <View className="bg-surface p-4 rounded-lg mb-3 border border-border">
                  <Text className="font-semibold text-foreground">
                    <HighlightedText text={row.result.title} term={debouncedSearchText} />
                  </Text>
                  <HighlightedText
                    text={row.result.content || "No content"}
                    term={debouncedSearchText}
                    textClassName="text-muted text-sm mt-1"
                  />
                  <Text className="text-muted text-xs mt-2">{row.result.createdAt.toLocaleString("ar-EG")}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={!!selectedResult} transparent animationType="fade" onRequestClose={() => setSelectedResult(null)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="rounded-t-3xl p-6 max-h-3/4" style={{ backgroundColor: colors.surface }}>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-bold text-foreground">Result Details</Text>
              <Pressable onPress={() => setSelectedResult(null)}>
                <MaterialIcons name="close" size={22} color={colors.foreground} />
              </Pressable>
            </View>

            {selectedResult ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View className="flex-row items-center mb-2">
                  <MaterialIcons
                    name={
                      selectedResult.type === "notes"
                        ? "description"
                        : selectedResult.type === "tasks"
                        ? "check-circle"
                        : "menu-book"
                    }
                    size={18}
                    color={colors.primary}
                  />
                  <Text className="text-xs text-muted ml-2">
                    {selectedResult.type === "notes"
                      ? "Note"
                      : selectedResult.type === "tasks"
                      ? "Task"
                      : "Journal"}
                  </Text>
                </View>
                <Text className="font-semibold text-foreground">{selectedResult.title}</Text>
                <Text className="text-muted text-xs mt-1 mb-3">
                  {selectedResult.createdAt.toLocaleString("ar-EG")}
                </Text>
                <Text className="text-foreground leading-6">{selectedResult.content || "No content"}</Text>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
