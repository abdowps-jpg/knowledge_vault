import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TextInputSelectionChangeEventData,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { useColors } from "@/hooks/use-colors";

type Selection = { start: number; end: number };

interface RichTextEditorProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const IS_WEB = Platform.OS === "web";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const chunks: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      chunks.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      chunks.push("</ol>");
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine ?? "";
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      closeLists();
      chunks.push("<div><br/></div>");
      continue;
    }

    const h1 = trimmed.match(/^#\s+(.*)$/);
    if (h1) {
      closeLists();
      chunks.push(`<h1>${renderInlineMarkdown(h1[1])}</h1>`);
      continue;
    }

    const h2 = trimmed.match(/^##\s+(.*)$/);
    if (h2) {
      closeLists();
      chunks.push(`<h2>${renderInlineMarkdown(h2[1])}</h2>`);
      continue;
    }

    const h3 = trimmed.match(/^###\s+(.*)$/);
    if (h3) {
      closeLists();
      chunks.push(`<h3>${renderInlineMarkdown(h3[1])}</h3>`);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      closeLists();
      chunks.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    const ul = trimmed.match(/^-\s+(.*)$/);
    if (ul) {
      if (inOl) {
        chunks.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        chunks.push("<ul>");
        inUl = true;
      }
      chunks.push(`<li>${renderInlineMarkdown(ul[1])}</li>`);
      continue;
    }

    const ol = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      if (inUl) {
        chunks.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        chunks.push("<ol>");
        inOl = true;
      }
      chunks.push(`<li>${renderInlineMarkdown(ol[1])}</li>`);
      continue;
    }

    closeLists();
    chunks.push(`<div>${renderInlineMarkdown(trimmed)}</div>`);
  }

  closeLists();
  return chunks.join("");
}

function inlineFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const el = node as HTMLElement;
  const text = Array.from(el.childNodes).map(inlineFromNode).join("");
  const tag = el.tagName.toLowerCase();
  const style = (el.getAttribute("style") || "").toLowerCase();
  const hasBoldStyle = /font-weight\s*:\s*(bold|[6-9]00)/.test(style);
  const hasItalicStyle = /font-style\s*:\s*italic/.test(style);

  if (tag === "strong" || tag === "b") return `**${text}**`;
  if (tag === "em" || tag === "i") return `*${text}*`;
  if (tag === "code") return `\`${text}\``;
  if (tag === "a") {
    const href = el.getAttribute("href") || "url";
    return `[${text}](${href})`;
  }
  if (tag === "br") return "\n";
  if (hasBoldStyle && hasItalicStyle) return `***${text}***`;
  if (hasBoldStyle) return `**${text}**`;
  if (hasItalicStyle) return `*${text}*`;
  return text;
}

function htmlToMarkdown(html: string): string {
  if (!IS_WEB || typeof document === "undefined") return html;

  const root = document.createElement("div");
  root.innerHTML = html;
  const lines: string[] = [];

  const pushTextLines = (text: string) => {
    const parts = text.split("\n").map((p) => p.trimEnd());
    lines.push(...parts);
  };

  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || "").trim();
      if (text) lines.push(text);
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "h1") {
      lines.push(`# ${inlineFromNode(el).trim()}`);
      continue;
    }
    if (tag === "h2") {
      lines.push(`## ${inlineFromNode(el).trim()}`);
      continue;
    }
    if (tag === "h3") {
      lines.push(`### ${inlineFromNode(el).trim()}`);
      continue;
    }
    if (tag === "blockquote") {
      pushTextLines(inlineFromNode(el).split("\n").map((l) => `> ${l.trim()}`).join("\n"));
      continue;
    }
    if (tag === "ul") {
      const items = Array.from(el.querySelectorAll(":scope > li"));
      for (const li of items) lines.push(`- ${inlineFromNode(li).trim()}`);
      continue;
    }
    if (tag === "ol") {
      const items = Array.from(el.querySelectorAll(":scope > li"));
      items.forEach((li, index) => lines.push(`${index + 1}. ${inlineFromNode(li).trim()}`));
      continue;
    }
    if (tag === "div" || tag === "p") {
      const content = inlineFromNode(el).trimEnd();
      if (content.length === 0) lines.push("");
      else pushTextLines(content);
      continue;
    }

    const fallback = inlineFromNode(el).trimEnd();
    if (fallback) pushTextLines(fallback);
  }

  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write...",
  minHeight = 160,
}: RichTextEditorProps) {
  const colors = useColors();
  const [isPreview, setIsPreview] = useState(false);
  const [selection, setSelection] = useState<Selection>({ start: value.length, end: value.length });
  const inputRef = useRef<TextInput | null>(null);
  const webEditorRef = useRef<HTMLDivElement | null>(null);
  const webRangeRef = useRef<Range | null>(null);
  const pendingSelectionRef = useRef<Selection | null>(null);

  useEffect(() => {
    if (pendingSelectionRef.current) {
      setSelection(pendingSelectionRef.current);
      pendingSelectionRef.current = null;
    }
  }, [value]);

  useEffect(() => {
    if (!IS_WEB || !webEditorRef.current) return;
    const currentMarkdown = htmlToMarkdown(webEditorRef.current.innerHTML || "");
    if (currentMarkdown !== value) {
      webEditorRef.current.innerHTML = markdownToHtml(value || "");
    }
  }, [value]);

  const markdownStyle = useMemo(
    () => ({
      body: { color: colors.foreground, fontSize: 15, lineHeight: 22 },
      heading1: { color: colors.foreground, fontSize: 24, fontWeight: "700" as const, marginBottom: 8 },
      heading2: { color: colors.foreground, fontSize: 20, fontWeight: "700" as const, marginBottom: 8 },
      heading3: { color: colors.foreground, fontSize: 18, fontWeight: "700" as const, marginBottom: 8 },
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
      ordered_list: { color: colors.foreground, marginBottom: 8 },
      blockquote: { color: colors.muted, borderLeftColor: colors.border, borderLeftWidth: 3, paddingLeft: 8 },
      link: { color: colors.primary },
      paragraph: { color: colors.foreground, marginBottom: 8 },
    }),
    [colors]
  );

  const applyTextEdit = (nextText: string, nextSelection: Selection) => {
    pendingSelectionRef.current = nextSelection;
    onChange(nextText);
    setIsPreview(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const saveWebSelection = () => {
    if (!IS_WEB || typeof window === "undefined" || !webEditorRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!webEditorRef.current.contains(range.commonAncestorContainer)) return;
    webRangeRef.current = range.cloneRange();
  };

  const restoreWebSelection = () => {
    if (!IS_WEB || typeof window === "undefined") return;
    if (!webRangeRef.current) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(webRangeRef.current);
  };

  const runWebCommand = (command: string, commandValue?: string) => {
    if (!IS_WEB || typeof document === "undefined") return;
    webEditorRef.current?.focus();
    restoreWebSelection();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command, false, commandValue);
    saveWebSelection();
    const nextMarkdown = htmlToMarkdown(webEditorRef.current?.innerHTML || "");
    onChange(nextMarkdown);
  };

  const runWebToolbarCommand = (event: any, command: string, commandValue?: string) => {
    if (!IS_WEB) return;
    if (event?.preventDefault) event.preventDefault();
    if (event?.stopPropagation) event.stopPropagation();
    runWebCommand(command, commandValue);
  };

  const insertAroundSelection = (prefix: string, suffix: string, placeholderText: string) => {
    const start = selection.start ?? value.length;
    const end = selection.end ?? value.length;
    const selected = value.slice(start, end);
    const inner = selected || placeholderText;
    const next = value.slice(0, start) + prefix + inner + suffix + value.slice(end);

    const innerStart = start + prefix.length;
    const innerEnd = innerStart + inner.length;
    const nextSelection = selected
      ? { start: innerEnd + suffix.length, end: innerEnd + suffix.length }
      : { start: innerStart, end: innerEnd };

    applyTextEdit(next, nextSelection);
  };

  const toggleLinePrefix = (prefix: string) => {
    const start = selection.start ?? value.length;
    const end = selection.end ?? value.length;

    const blockStartIndex = value.lastIndexOf("\n", Math.max(0, start - 1));
    const blockStart = blockStartIndex === -1 ? 0 : blockStartIndex + 1;
    const blockEndIndex = value.indexOf("\n", end);
    const blockEnd = blockEndIndex === -1 ? value.length : blockEndIndex;

    const block = value.slice(blockStart, blockEnd);
    const lines = block.split("\n");
    const allPrefixed = lines.every((line) => line.startsWith(prefix));

    const transformed = lines.map((line) => {
      if (allPrefixed) {
        return line.startsWith(prefix) ? line.slice(prefix.length) : line;
      }
      return prefix + line;
    });

    const replacement = transformed.join("\n");
    const next = value.slice(0, blockStart) + replacement + value.slice(blockEnd);
    const delta = replacement.length - block.length;

    applyTextEdit(next, { start, end: end + delta });
  };

  const insertLink = () => {
    if (IS_WEB && typeof window !== "undefined") {
      restoreWebSelection();
      const url = window.prompt("Enter link URL", "https://");
      if (!url) return;
      runWebCommand("createLink", url);
      return;
    }

    const start = selection.start ?? value.length;
    const end = selection.end ?? value.length;
    const selected = value.slice(start, end);
    const text = selected || "text";
    const insertion = `[${text}](url)`;
    const next = value.slice(0, start) + insertion + value.slice(end);

    const urlStart = start + text.length + 3;
    applyTextEdit(next, { start: urlStart, end: urlStart + 3 });
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {IS_WEB ? (
            <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
              <button style={toolbarButtonStyle as any} onMouseDown={(e) => runWebToolbarCommand(e, "bold")}>B</button>
              <button style={toolbarButtonStyle as any} onMouseDown={(e) => runWebToolbarCommand(e, "italic")}>*I</button>
              <button style={toolbarButtonStyle as any} onMouseDown={(e) => runWebToolbarCommand(e, "formatBlock", "h1")}>H1</button>
              <button style={toolbarButtonStyle as any} onMouseDown={(e) => runWebToolbarCommand(e, "formatBlock", "h2")}>H2</button>
              <button style={toolbarButtonStyle as any} onMouseDown={(e) => runWebToolbarCommand(e, "formatBlock", "h3")}>H3</button>
              <button style={toolbarButtonStyle as any} onMouseDown={(e) => runWebToolbarCommand(e, "insertUnorderedList")}>-</button>
              <button style={toolbarButtonStyle as any} onMouseDown={(e) => runWebToolbarCommand(e, "insertOrderedList")}>1.</button>
              <button style={toolbarButtonStyle as any} onMouseDown={(e) => runWebToolbarCommand(e, "formatBlock", "blockquote")}>&gt;</button>
              <button style={toolbarButtonStyle as any} onMouseDown={(e) => { e.preventDefault(); toggleLinePrefix("- [ ] "); }}>[ ]</button>
              <button style={toolbarButtonStyle as any} onMouseDown={(e) => { e.preventDefault(); insertLink(); }}>Link</button>
              <button style={toolbarButtonStyle as any} onMouseDown={(e) => runWebToolbarCommand(e, "insertHTML", "<code>code</code>")}>{`</>`}</button>
            </div>
          ) : (
            <>
              <Pressable onPress={() => insertAroundSelection("**", "**", "bold")} style={toolbarButtonStyle}>
                <Text style={{ color: colors.foreground, fontWeight: "700" }}>B</Text>
              </Pressable>
              <Pressable onPress={() => insertAroundSelection("*", "*", "italic")} style={toolbarButtonStyle}>
                <Text style={{ color: colors.foreground, fontStyle: "italic" }}>*I</Text>
              </Pressable>
              <Pressable onPress={() => toggleLinePrefix("# ")} style={toolbarButtonStyle}>
                <Text style={{ color: colors.foreground, fontWeight: "700" }}>H1</Text>
              </Pressable>
              <Pressable onPress={() => toggleLinePrefix("## ")} style={toolbarButtonStyle}>
                <Text style={{ color: colors.foreground, fontWeight: "700" }}>H2</Text>
              </Pressable>
              <Pressable onPress={() => toggleLinePrefix("### ")} style={toolbarButtonStyle}>
                <Text style={{ color: colors.foreground, fontWeight: "700" }}>H3</Text>
              </Pressable>
              <Pressable onPress={() => toggleLinePrefix("- ")} style={toolbarButtonStyle}>
                <Text style={{ color: colors.foreground }}>-</Text>
              </Pressable>
              <Pressable onPress={() => toggleLinePrefix("1. ")} style={toolbarButtonStyle}>
                <Text style={{ color: colors.foreground }}>1.</Text>
              </Pressable>
              <Pressable onPress={() => toggleLinePrefix("> ")} style={toolbarButtonStyle}>
                <Text style={{ color: colors.foreground }}>&gt;</Text>
              </Pressable>
              <Pressable onPress={() => toggleLinePrefix("- [ ] ")} style={toolbarButtonStyle}>
                <Text style={{ color: colors.foreground }}>[ ]</Text>
              </Pressable>
              <Pressable onPress={insertLink} style={toolbarButtonStyle}>
                <Text style={{ color: colors.foreground }}>Link</Text>
              </Pressable>
              <Pressable onPress={() => insertAroundSelection("`", "`", "code")} style={toolbarButtonStyle}>
                <Text style={{ color: colors.foreground }}>{`</>`}</Text>
              </Pressable>
            </>
          )}
          {!IS_WEB ? (
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
          ) : null}
        </ScrollView>
      </View>

      {isPreview && !IS_WEB ? (
        <ScrollView style={{ minHeight, paddingHorizontal: 12, paddingTop: 10 }} keyboardShouldPersistTaps="handled">
          <Markdown style={markdownStyle}>{value || "_Nothing to preview yet._"}</Markdown>
        </ScrollView>
      ) : IS_WEB ? (
        <View style={{ minHeight, paddingHorizontal: 12, paddingVertical: 10 }}>
          <div
            ref={webEditorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => {
              saveWebSelection();
              onChange(htmlToMarkdown(webEditorRef.current?.innerHTML || ""));
            }}
            onKeyUp={saveWebSelection}
            onMouseUp={saveWebSelection}
            onFocus={saveWebSelection}
            style={{
              minHeight: `${minHeight - 20}px`,
              color: colors.foreground,
              fontSize: "15px",
              lineHeight: "22px",
              outline: "none",
              fontFamily: "inherit",
            }}
            data-placeholder={placeholder}
          />
        </View>
      ) : (
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          selection={selection}
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
