import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";

export interface FilterOption {
  key: string;
  label: string;
}

export interface SortOption {
  key: string;
  label: string;
}

export interface ActiveFilterChip {
  key: string;
  label: string;
}

interface FilterBarProps {
  filterOptions: FilterOption[];
  sortOptions: SortOption[];
  selectedSort: string;
  onSelectFilter: (key: string) => void;
  onSelectSort: (key: string) => void;
  activeChips: ActiveFilterChip[];
  onRemoveChip: (key: string) => void;
  onClearAll: () => void;
}

export function FilterBar({
  filterOptions,
  sortOptions,
  selectedSort,
  onSelectFilter,
  onSelectSort,
  activeChips,
  onRemoveChip,
  onClearAll,
}: FilterBarProps) {
  const colors = useColors();
  const [showFilterMenu, setShowFilterMenu] = React.useState(false);
  const [showSortMenu, setShowSortMenu] = React.useState(false);

  return (
    <View className="px-4 py-3 border-b border-border">
      <View className="flex-row">
        <Pressable
          onPress={() => {
            setShowFilterMenu((prev) => !prev);
            setShowSortMenu(false);
          }}
          className="mr-2 px-3 py-2 rounded-lg border flex-row items-center"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <MaterialIcons name="filter-list" size={16} color={colors.foreground} />
          <Text className="ml-2 text-foreground text-sm font-semibold">Filter</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setShowSortMenu((prev) => !prev);
            setShowFilterMenu(false);
          }}
          className="px-3 py-2 rounded-lg border flex-row items-center"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <MaterialIcons name="sort" size={16} color={colors.foreground} />
          <Text className="ml-2 text-foreground text-sm font-semibold">Sort</Text>
        </Pressable>
      </View>

      {showFilterMenu ? (
        <View className="mt-2 bg-surface border border-border rounded-lg p-2">
          {filterOptions.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => {
                onSelectFilter(option.key);
                setShowFilterMenu(false);
              }}
              className="px-3 py-2 rounded-md"
            >
              <Text className="text-foreground text-sm">{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {showSortMenu ? (
        <View className="mt-2 bg-surface border border-border rounded-lg p-2">
          {sortOptions.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => {
                onSelectSort(option.key);
                setShowSortMenu(false);
              }}
              className="px-3 py-2 rounded-md flex-row items-center justify-between"
            >
              <Text className="text-foreground text-sm">{option.label}</Text>
              {selectedSort === option.key ? (
                <MaterialIcons name="check" size={16} color={colors.primary} />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {activeChips.length > 0 ? (
        <View className="mt-3">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {activeChips.map((chip) => (
              <View
                key={chip.key}
                className="mr-2 px-3 py-1 rounded-full border flex-row items-center"
                style={{ borderColor: colors.border, backgroundColor: colors.surface }}
              >
                <Text className="text-foreground text-xs mr-1">{chip.label}</Text>
                <Pressable onPress={() => onRemoveChip(chip.key)}>
                  <MaterialIcons name="close" size={14} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <Pressable onPress={onClearAll} className="mt-2 self-start">
            <Text style={{ color: colors.primary }} className="text-xs font-semibold">
              Clear All Filters
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
