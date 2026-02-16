import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View, NativeSyntheticEvent, TextInputSelectionChangeEventData } from "react-native";
import Markdown from "react-native-markdown-display";
import { useColors } from "@/hooks/use-colors";

type Selection = { start: number; end: number };

interface RichTextEditorProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write...",
  minHeight = 160,
}: RichTextEditorProps) {
  const colors = useColors();
  const [isPreview, setIsPreview] = useState(false);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });

  const markdownStyle = useMemo(
    () => ({
      body: { color: colors.foreground, fontSize: 15, lineHeight: 22 },
      heading1: { color: colors.foreground, fontSize: 24, fontWeight: "700" as const, marginBottom: 8 },
      strong: { color: colors.foreground, fontWeight: "700" as const },
      em: { color: colors.foreground, fontStyle: "italic" as const },
      code_inline: {
        color: colors.foreground,
        backgroundColor: colors.background,
        borderRadius: 4,
        paddingHorizontal: 4,
        paddingVertical: 2,
      },
      bullet_list: { color: colors.foreground, marginBottom: 8 },
      link: { color: colors.primary },
      paragraph: { color: colors.foreground, marginBottom: 8 },
    }),
    [colors]
  );

  const insertAroundSelection = (prefix: string, suffix: string, placeholderText: string) => {
    const start = selection.start ?? value.length;
    const end = selection.end ?? value.length;
    const selected = value.slice(start, end);
    const inner = selected || placeholderText;
    const next = value.slice(0, start) + prefix + inner + suffix + value.slice(end);
    onChange(next);
  };

  const insertAtLineStart = (prefix: string) => {
    const cursor = selection.start ?? value.length;
    const lineStart = value.lastIndexOf("\n", Math.max(0, cursor - 1));
    const index = lineStart === -1 ? 0 : lineStart + 1;
    const next = value.slice(0, index) + prefix + value.slice(index);
    onChange(next);
  };

  const insertLink = () => {
    insertAroundSelection("[", "](url)", "text");
  };

  const handleSelectionChange = (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    setSelection(event.nativeEvent.selection);
  };

  const toolbarButtonStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8,
  } as const;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <View style={{ borderBottomColor: colors.border, borderBottomWidth: 1, padding: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable onPress={() => insertAroundSelection("**", "**", "bold")} style={toolbarButtonStyle}>
            <Text style={{ color: colors.foreground, fontWeight: "700" }}>B</Text>
          </Pressable>
          <Pressable onPress={() => insertAroundSelection("*", "*", "italic")} style={toolbarButtonStyle}>
            <Text style={{ color: colors.foreground, fontStyle: "italic" }}>*I</Text>
          </Pressable>
          <Pressable onPress={() => insertAtLineStart("# ")} style={toolbarButtonStyle}>
            <Text style={{ color: colors.foreground, fontWeight: "700" }}>H1</Text>
          </Pressable>
          <Pressable onPress={() => insertAtLineStart("- ")} style={toolbarButtonStyle}>
            <Text style={{ color: colors.foreground }}>•</Text>
          </Pressable>
          <Pressable onPress={insertLink} style={toolbarButtonStyle}>
            <Text style={{ color: colors.foreground }}>🔗</Text>
          </Pressable>
          <Pressable onPress={() => insertAroundSelection("`", "`", "code")} style={toolbarButtonStyle}>
            <Text style={{ color: colors.foreground }}>{`</>`}</Text>
          </Pressable>
          <Pressable
            onPress={() => setIsPreview((prev) => !prev)}
            style={[
              toolbarButtonStyle,
              {
                backgroundColor: isPreview ? colors.primary : colors.surface,
                marginRight: 0,
              },
            ]}
          >
            <Text style={{ color: isPreview ? "white" : colors.foreground, fontWeight: "600" }}>
              {isPreview ? "Edit" : "Preview"}
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {isPreview ? (
        <ScrollView style={{ minHeight, paddingHorizontal: 12, paddingTop: 10 }}>
          <Markdown style={markdownStyle}>{value || "_Nothing to preview yet._"}</Markdown>
        </ScrollView>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChange}
          onSelectionChange={handleSelectionChange}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          multiline
          textAlignVertical="top"
          style={{
            minHeight,
            color: colors.foreground,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 15,
          }}
        />
      )}
    </View>
  );
}
