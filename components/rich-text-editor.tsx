import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Switch,
} from "react-native";
import { IconSymbol } from "./ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

interface RichTextEditorProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  showPreview?: boolean;
  onPreviewToggle?: (show: boolean) => void;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Start typing...",
  showPreview = false,
  onPreviewToggle,
}: RichTextEditorProps) {
  const colors = useColors();
  const [isPreviewMode, setIsPreviewMode] = useState(showPreview);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  const handleTextChange = (text: string) => {
    onChange(text);

    // Update statistics
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0).length;
    const chars = text.length;

    setWordCount(words);
    setCharCount(chars);
  };

  const handlePreviewToggle = (show: boolean) => {
    setIsPreviewMode(show);
    onPreviewToggle?.(show);
  };

  const applyFormatting = (before: string, after: string = "") => {
    const start = value.length;
    const newText = value + before + after;
    handleTextChange(newText);
  };

  const renderMarkdownPreview = (markdown: string) => {
    // Simple markdown rendering
    const lines = markdown.split("\n");
    const rendered = lines.map((line, index) => {
      // Headers
      if (line.startsWith("# ")) {
        return (
          <Text key={index} className="text-2xl font-bold text-foreground mb-2">
            {line.substring(2)}
          </Text>
        );
      }
      if (line.startsWith("## ")) {
        return (
          <Text key={index} className="text-xl font-bold text-foreground mb-2">
            {line.substring(3)}
          </Text>
        );
      }
      if (line.startsWith("### ")) {
        return (
          <Text key={index} className="text-lg font-bold text-foreground mb-2">
            {line.substring(4)}
          </Text>
        );
      }

      // Bold
      let processedLine = line.replace(/\*\*(.*?)\*\*/g, "$1");

      // Italic
      processedLine = processedLine.replace(/\*(.*?)\*/g, "$1");

      // Code
      if (processedLine.startsWith("`")) {
        return (
          <Text
            key={index}
            className="bg-background text-primary font-mono text-sm p-2 rounded mb-2"
          >
            {processedLine.replace(/`/g, "")}
          </Text>
        );
      }

      // Lists
      if (processedLine.startsWith("- ")) {
        return (
          <Text key={index} className="text-foreground mb-1">
            • {processedLine.substring(2)}
          </Text>
        );
      }

      // Regular text
      if (processedLine.trim()) {
        return (
          <Text key={index} className="text-foreground mb-2 leading-relaxed">
            {processedLine}
          </Text>
        );
      }

      return <View key={index} className="mb-2" />;
    });

    return rendered;
  };

  return (
    <View className="flex-1 bg-surface rounded-lg overflow-hidden">
      {/* Toolbar */}
      <View className="bg-background border-b border-border p-3">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-row gap-2"
        >
          {/* Bold */}
          <Pressable
            onPress={() => applyFormatting("**", "**")}
            className="bg-surface px-3 py-2 rounded"
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text className="font-bold text-foreground">B</Text>
          </Pressable>

          {/* Italic */}
          <Pressable
            onPress={() => applyFormatting("*", "*")}
            className="bg-surface px-3 py-2 rounded"
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text className="italic text-foreground">I</Text>
          </Pressable>

          {/* Heading 1 */}
          <Pressable
            onPress={() => applyFormatting("# ")}
            className="bg-surface px-3 py-2 rounded"
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text className="font-bold text-foreground text-lg">H1</Text>
          </Pressable>

          {/* Heading 2 */}
          <Pressable
            onPress={() => applyFormatting("## ")}
            className="bg-surface px-3 py-2 rounded"
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text className="font-bold text-foreground">H2</Text>
          </Pressable>

          {/* Bullet List */}
          <Pressable
            onPress={() => applyFormatting("- ")}
            className="bg-surface px-3 py-2 rounded"
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text className="text-foreground">•</Text>
          </Pressable>

          {/* Code Block */}
          <Pressable
            onPress={() => applyFormatting("`", "`")}
            className="bg-surface px-3 py-2 rounded"
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text className="font-mono text-foreground text-sm">&lt;&gt;</Text>
          </Pressable>

          {/* Quote */}
          <Pressable
            onPress={() => applyFormatting("> ")}
            className="bg-surface px-3 py-2 rounded"
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text className="text-foreground">"</Text>
          </Pressable>

          {/* Preview Toggle */}
          <View className="flex-row items-center gap-2 px-3 py-2 ml-2 border-l border-border">
            <Text className="text-xs text-muted">Preview</Text>
            <Switch
              value={isPreviewMode}
              onValueChange={handlePreviewToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </ScrollView>
      </View>

      {/* Editor or Preview */}
      {!isPreviewMode ? (
        <TextInput
          value={value}
          onChangeText={handleTextChange}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={10}
          className="flex-1 p-4 text-foreground text-base"
          style={{ color: colors.foreground }}
          textAlignVertical="top"
        />
      ) : (
        <ScrollView className="flex-1 p-4">
          {renderMarkdownPreview(value)}
        </ScrollView>
      )}

      {/* Statistics Footer */}
      <View className="bg-background border-t border-border px-4 py-2 flex-row justify-between">
        <Text className="text-xs text-muted">
          Words: {wordCount} | Characters: {charCount}
        </Text>
        <Text className="text-xs text-muted">
          {isPreviewMode ? "Preview Mode" : "Edit Mode"}
        </Text>
      </View>
    </View>
  );
}

// ============================================================================
// Markdown Utilities
// ============================================================================

export const MarkdownUtils = {
  /**
   * Convert markdown to plain text
   */
  toPlainText(markdown: string): string {
    return markdown
      .replace(/#{1,6}\s/g, "") // Remove headers
      .replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold
      .replace(/\*(.*?)\*/g, "$1") // Remove italic
      .replace(/`(.*?)`/g, "$1") // Remove code
      .replace(/\[(.*?)\]\(.*?\)/g, "$1") // Remove links
      .replace(/^[-*+]\s/gm, "") // Remove lists
      .replace(/^>\s/gm, ""); // Remove quotes
  },

  /**
   * Get word count
   */
  getWordCount(text: string): number {
    return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
  },

  /**
   * Get character count
   */
  getCharCount(text: string): number {
    return text.length;
  },

  /**
   * Get reading time in minutes
   */
  getReadingTime(text: string): number {
    const wordCount = MarkdownUtils.getWordCount(text);
    const wordsPerMinute = 200;
    return Math.ceil(wordCount / wordsPerMinute);
  },

  /**
   * Extract headings from markdown
   */
  extractHeadings(markdown: string): string[] {
    const headingRegex = /^#{1,6}\s+(.+)$/gm;
    const headings: string[] = [];
    let match;

    while ((match = headingRegex.exec(markdown)) !== null) {
      headings.push(match[1]);
    }

    return headings;
  },

  /**
   * Extract links from markdown
   */
  extractLinks(markdown: string): string[] {
    const linkRegex = /\[(.*?)\]\((.*?)\)/g;
    const links: string[] = [];
    let match;

    while ((match = linkRegex.exec(markdown)) !== null) {
      links.push(match[2]);
    }

    return links;
  },
};
