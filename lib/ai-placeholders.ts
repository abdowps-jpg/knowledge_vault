export function suggestTags(content: string): string[] {
  // TODO: Integrate with OpenAI API or local LLM for semantic tag suggestions.
  const words = content
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4);
  return Array.from(new Set(words)).slice(0, 5);
}

export function suggestCategory(content: string): string | null {
  // TODO: AI categorization model integration.
  if (/task|todo|deadline/i.test(content)) return "Work";
  if (/journal|mood|day/i.test(content)) return "Personal";
  return null;
}

export function generateSummary(content: string): string {
  // TODO: Replace with LLM summary generation.
  return content.length > 180 ? `${content.slice(0, 180)}...` : content;
}

export function findRelatedItems<T extends { id: string; content?: string }>(item: T, items: T[]): T[] {
  // TODO: semantic similarity search embedding integration.
  const terms = new Set((item.content || "").toLowerCase().split(/\W+/));
  return items
    .filter((i) => i.id !== item.id)
    .map((i) => ({
      item: i,
      score: (i.content || "")
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => terms.has(w)).length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.item);
}
