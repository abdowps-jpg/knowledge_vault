import React from "react";
import { Pressable, Text, View } from "react-native";
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
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Pressable
          onPress={() => {
            console.log("[FilterBar] Filter menu toggled");
            setShowFilterMenu((prev) => !prev);
            setShowSortMenu(false);
          }}
          style={{
            marginRight: 8,
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            flexDirection: "row",
            alignItems: "center",
            minWidth: 96,
          }}
        >
          <MaterialIcons name="filter-list" size={16} color={colors.foreground} />
          <Text style={{ marginLeft: 8, color: colors.foreground, fontSize: 15, fontWeight: "700" }}>
            Filter
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            console.log("[FilterBar] Sort menu toggled");
            setShowSortMenu((prev) => !prev);
            setShowFilterMenu(false);
          }}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            flexDirection: "row",
            alignItems: "center",
            minWidth: 88,
          }}
        >
          <MaterialIcons name="sort" size={16} color={colors.foreground} />
          <Text style={{ marginLeft: 8, color: colors.foreground, fontSize: 15, fontWeight: "700" }}>
            Sort
          </Text>
        </Pressable>
      </View>

      {showFilterMenu ? (
        <View
          style={{
            marginTop: 10,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: 8,
            zIndex: 20,
            elevation: 20,
          }}
        >
          {filterOptions.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => {
                onSelectFilter(option.key);
                setShowFilterMenu(false);
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: colors.foreground, fontSize: 14 }}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {showSortMenu ? (
        <View
          style={{
            marginTop: 10,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: 8,
            zIndex: 20,
            elevation: 20,
          }}
        >
          {sortOptions.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => {
                onSelectSort(option.key);
                setShowSortMenu(false);
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 8,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: colors.foreground, fontSize: 14 }}>{option.label}</Text>
              {selectedSort === option.key ? (
                <MaterialIcons name="check" size={16} color={colors.primary} />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {activeChips.length > 0 ? (
        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {activeChips.map((chip) => (
              <View
                key={chip.key}
                style={{
                  marginRight: 8,
                  marginBottom: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: colors.foreground, fontSize: 13, marginRight: 4 }}>{chip.label}</Text>
                <Pressable onPress={() => onRemoveChip(chip.key)} hitSlop={6}>
                  <MaterialIcons name="close" size={14} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </View>
          <Pressable onPress={onClearAll} style={{ marginTop: 2, alignSelf: "flex-start" }}>
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>
              Clear All Filters
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
