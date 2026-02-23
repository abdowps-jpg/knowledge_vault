export type QuickTemplate = {
  id: string;
  name: string;
  title: string;
  content: string;
  targetTab: "note" | "task";
};

export const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    id: "daily-journal",
    name: "Daily Journal",
    title: "Daily Journal",
    content: "Date:\nMood:\nHighlights:\nChallenges:\nGratitude:\nTomorrow plan:",
    targetTab: "note",
  },
  {
    id: "meeting-notes",
    name: "Meeting Notes",
    title: "Meeting Notes",
    content: "Meeting:\nAttendees:\nAgenda:\nDecisions:\nAction Items:\nFollow-up:",
    targetTab: "note",
  },
  {
    id: "project-plan",
    name: "Project Plan",
    title: "Project Plan",
    content: "Goal:\nScope:\nMilestones:\nRisks:\nDependencies:\nNext Steps:",
    targetTab: "note",
  },
  {
    id: "book-notes",
    name: "Book Notes",
    title: "Book Notes",
    content: "Book:\nAuthor:\nKey Ideas:\nFavorite Quotes:\nActionable Takeaways:",
    targetTab: "note",
  },
  {
    id: "workout-log",
    name: "Workout Log",
    title: "Workout Log",
    content: "Workout Type:\nDuration:\nExercises:\nIntensity:\nNotes:",
    targetTab: "task",
  },
  {
    id: "weekly-review",
    name: "Weekly Review",
    title: "Weekly Review",
    content: "Wins:\nMisses:\nLessons Learned:\nTop Priorities for Next Week:",
    targetTab: "note",
  },
];

