import AsyncStorage from "@react-native-async-storage/async-storage";
import { createItem } from "@/lib/db/storage";

const SEED_KEY = "onboarding_data_seeded";

export async function seedOnboardingData(): Promise<void> {
  const already = await AsyncStorage.getItem(SEED_KEY);
  if (already === "true") return;

  try {
    await Promise.all([
      createItem({
        title: "Welcome to Knowledge Vault!",
        type: "note",
        content:
          "This is your **Inbox** — a place to quickly capture ideas, links, and thoughts.\n\n" +
          "From here you can:\n" +
          "- Move items to **Library** for long-term storage\n" +
          "- Convert items to **Tasks** in Actions\n" +
          "- Send items to your **Journal**\n\n" +
          "Try tapping the **+** button to add your first note!",
        location: "inbox",
        isFavorite: false,
      } as any),
      createItem({
        title: "Markdown formatting example",
        type: "note",
        content:
          "# Heading 1\n## Heading 2\n\n" +
          "**Bold text** and *italic text*\n\n" +
          "- Bullet list item 1\n- Bullet list item 2\n\n" +
          "1. Numbered list\n2. Second item\n\n" +
          "> This is a blockquote\n\n" +
          "`inline code` and code blocks:\n```\nconst hello = 'world';\n```",
        location: "library",
        isFavorite: true,
      } as any),
      createItem({
        title: "Interesting article to read later",
        type: "link",
        content: "A great resource about productivity and knowledge management.",
        url: "https://example.com/productivity",
        location: "inbox",
        isFavorite: false,
      } as any),
    ]);

    await AsyncStorage.setItem(SEED_KEY, "true");
  } catch (error) {
    console.error("[OnboardingSeed] Failed to seed sample data:", error);
  }
}
