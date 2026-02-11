# Knowledge Vault - Mobile App Design Document

## Design Philosophy

Knowledge Vault follows **Apple Human Interface Guidelines (HIG)** principles to deliver a first-party iOS experience. The design prioritizes simplicity, clarity, and one-handed usage on mobile portrait orientation (9:16). Every interaction is optimized for "minimum taps to value."

---

## Screen List

The Knowledge Vault app consists of five main sections accessible via a bottom tab bar, plus supporting screens for detail views and settings.

| Screen | Purpose | Key Components |
|--------|---------|-----------------|
| **Inbox** | Quick capture of all new content | List of recent items, Quick Add button, type indicators |
| **Library** | Organized, permanent knowledge storage | Categorized/tagged content, filters, favorites, archive |
| **Actions** | Task management and execution | Task list, due dates, priorities, subtasks, completion tracking |
| **Journal** | Daily reflection and memory capture | Calendar view, daily entries, mood/weather/location, attachments |
| **Search** | Find any content across the app | Full-text search, multi-filter results, type indicators |
| **Settings** | User preferences and account management | Notifications, privacy, backup/export, theme, account |
| **Item Detail** | View/edit individual content | Full content, metadata, tags, attachments, actions |
| **Task Detail** | View/edit individual task | Title, description, due date, priority, subtasks, recurrence |
| **Journal Entry Detail** | View/edit daily journal entry | Full entry, mood, location, weather, attachments, lock status |

---

## Primary Content and Functionality

### Inbox Screen

**Purpose:** Rapid capture without friction. Items arrive here first, then move to Library or Actions.

**Content:**
- List of items sorted by newest first
- Each item shows: type icon, title (first line), timestamp, preview of content
- Visual indicators for type: 📝 (Note), 💬 (Quote), 🔗 (Link), 🎙️ (Audio), ✓ (Task), 📅 (Journal)

**Functionality:**
- **Quick Add Button** (floating, bottom-right): Opens modal to choose content type
- **Swipe Actions** (left): Archive, Delete
- **Tap Item**: Opens detail view
- **Long Press**: Shows context menu (Move to Library, Convert to Task, Delete)
- **Pull-to-Refresh**: Sync with backend (if enabled)

### Library Screen

**Purpose:** Permanent, organized knowledge repository with powerful filtering.

**Content:**
- Horizontal filter bar: All | Category 1 | Category 2 | Tags | Favorites | Archived
- List of items with: type icon, title, tags, last modified date
- Empty state when no items match filters

**Functionality:**
- **Filter by Category/Tag**: Tap to filter, tap again to clear
- **Favorites Toggle**: Star icon to mark/unmark as favorite
- **Archive/Restore**: Archive old items, restore from archive
- **Edit Item**: Tap to open detail view
- **Search**: Tap search icon in header to filter by text
- **Bulk Actions**: Long press to select multiple items, then archive/delete/tag

### Actions Screen

**Purpose:** Task management with focus on due dates and priorities.

**Content:**
- Filter bar: All | Today | This Week | Completed | High Priority
- Task list sorted by: due date (ascending), then priority (high → low)
- Each task shows: checkbox, title, due date, priority badge (🔴 High, 🟡 Medium, ⚪ Low)
- Completed tasks shown with strikethrough and lower opacity

**Functionality:**
- **Complete Task**: Tap checkbox to mark done
- **Add Task**: Tap + button to create new task
- **Edit Task**: Tap to open detail view
- **Subtasks**: Tap task → "Add Subtask" → creates child task
- **Recurrence**: Set daily/weekly/monthly repeat patterns
- **Notifications**: System alerts before due date (configurable)

### Journal Screen

**Purpose:** Daily reflection with calendar-based navigation and rich metadata.

**Content:**
- Calendar view (month/week/day selector at top)
- Days with entries marked with small dot
- List of entries for selected day: title, time, mood emoji, location/weather icons, attachment indicators
- Each entry shows: title, excerpt, mood, location, weather, lock icon (if private)

**Functionality:**
- **Create Entry**: Tap + button or tap empty day on calendar
- **View Entry**: Tap to open detail view
- **Lock Entry**: Toggle privacy (requires biometric auth to view)
- **Templates**: Predefined prompts (e.g., "What made me happy today?", "Key learnings")
- **Mood Selector**: 5-point scale or emoji picker
- **Location/Weather**: Auto-capture or manual entry
- **Attachments**: Add photos or audio recordings

### Search Screen

**Purpose:** Find anything across all content types using full-text search and filters.

**Content:**
- Search bar at top with clear button
- Filter chips: Type | Date Range | Tag | Status
- Results list showing: type icon, title, excerpt (with search term highlighted), tags, date

**Functionality:**
- **Real-time Search**: Results update as user types
- **Filter by Type**: Note, Quote, Task, Journal, Link, Audio
- **Filter by Date**: Today, This Week, This Month, Custom Range
- **Filter by Tag**: Select one or multiple tags
- **Filter by Status**: For tasks (Completed, Pending)
- **Tap Result**: Opens detail view

### Settings Screen

**Purpose:** Customize app behavior, manage privacy, and handle data.

**Content:**
- Grouped sections: Account | Notifications | Privacy | Sync | About
- Each section has toggles, pickers, and buttons

**Functionality:**
- **Account**: Username, email, change password
- **Notifications**: Toggle task reminders, spaced repetition reminders, set times
- **Privacy**: Biometric lock, export data, backup, delete all data
- **Sync**: Toggle auto-sync, view last sync time, manual sync button
- **About**: App version, terms, privacy policy, contact support

---

## Key User Flows

### Flow 1: Add → Organize → Search → Review

1. **Add**: User taps Quick Add → selects type (Note/Quote/Task/Journal) → enters content → saves to Inbox
2. **Organize**: User opens Library → finds item in Inbox → moves to Library → adds tags/category → marks favorite if important
3. **Search**: User opens Search → types keyword → filters by type/date/tag → finds relevant items
4. **Review**: User gets notification for spaced repetition → taps notification → reviews item → marks as reviewed (updates next review date)

### Flow 2: Create Task → Track → Complete

1. **Create**: User taps Actions → taps + → enters title, due date, priority, recurrence → saves
2. **Track**: User sees task in list, sorted by due date → gets notification before due date
3. **Complete**: User taps checkbox → task marked done → removed from "Pending" filter

### Flow 3: Daily Journal Entry

1. **Create**: User taps Journal → taps + → enters title and content → adds mood, location, weather (optional) → adds photos/audio (optional) → saves
2. **Review**: User opens Journal → browses calendar → taps day with entries → reads past entries
3. **Reflect**: User sees spaced repetition notification suggesting old entry → taps to review → reflects on growth

### Flow 4: Audio Capture → Transcription → Organize

1. **Capture**: User taps Quick Add → selects Audio → taps record → speaks → stops recording
2. **Transcribe**: App converts audio to text (background process)
3. **Review**: User sees transcribed text in Inbox → edits if needed → moves to Library with tags

---

## Color Choices

Knowledge Vault uses a clean, professional color palette inspired by modern productivity apps (Notion, Obsidian, Day One).

| Color | Hex | Usage |
|-------|-----|-------|
| **Primary (Teal)** | `#0a7ea4` | Buttons, links, active states, highlights |
| **Background (Light)** | `#ffffff` | Main screen background (light mode) |
| **Background (Dark)** | `#151718` | Main screen background (dark mode) |
| **Surface (Light)** | `#f5f5f5` | Cards, input fields (light mode) |
| **Surface (Dark)** | `#1e2022` | Cards, input fields (dark mode) |
| **Foreground (Light)** | `#11181c` | Primary text (light mode) |
| **Foreground (Dark)** | `#ecedee` | Primary text (dark mode) |
| **Muted (Light)** | `#687076` | Secondary text, hints (light mode) |
| **Muted (Dark)** | `#9ba1a6` | Secondary text, hints (dark mode) |
| **Border (Light)** | `#e5e7eb` | Dividers, borders (light mode) |
| **Border (Dark)** | `#334155` | Dividers, borders (dark mode) |
| **Success** | `#22c55e` | Completed tasks, success messages |
| **Warning** | `#f59e0b` | Warnings, pending items |
| **Error** | `#ef4444` | Errors, delete actions |

---

## Typography

- **Heading 1** (Screen titles): 28px, Bold, Foreground color
- **Heading 2** (Section titles): 20px, Semibold, Foreground color
- **Body** (Main content): 16px, Regular, Foreground color
- **Caption** (Timestamps, hints): 12px, Regular, Muted color
- **Button** (Call-to-action): 16px, Semibold, white text on Primary background

---

## Spacing & Layout

- **Padding**: 16px standard (top/bottom/sides of screens)
- **Gap Between Elements**: 12px (vertical), 8px (horizontal)
- **Card Padding**: 12px
- **List Item Height**: 56px minimum (touch target)
- **Bottom Tab Bar Height**: 56px + safe area inset

---

## Interaction Patterns

### Tap Feedback
- **Primary Buttons**: Scale 0.97 + haptic feedback (light impact)
- **List Items**: Opacity 0.7 on press
- **Icons**: Opacity 0.6 on press

### Haptic Feedback
- **Task Completion**: Light impact
- **Item Deletion**: Medium impact
- **Success (Backup/Sync)**: Success notification
- **Error**: Error notification

### Animations
- **Screen Transitions**: Slide from right (push), slide to right (pop)
- **Modal Appearance**: Fade in from bottom
- **List Updates**: Subtle fade in for new items
- **No animations on mount** unless adding meaningful context

---

## Accessibility

- **Minimum Touch Target**: 44×44 points
- **Color Contrast**: WCAG AA standard (4.5:1 for text)
- **Font Scaling**: Support system font size settings
- **VoiceOver Support**: All interactive elements labeled
- **Dark Mode**: Full support with automatic color switching

---

## Offline-First Architecture

- **Local Storage**: SQLite database stores all content locally
- **Sync Strategy**: Changes queued locally, synced when online
- **Conflict Resolution**: Last-write-wins for simplicity in MVP
- **Indicators**: Show sync status in header (cloud icon with checkmark/spinner)

---

## Privacy & Security

- **Biometric Lock**: Optional fingerprint/face recognition to unlock app
- **Journal Entry Lock**: Individual entries can be marked private (require biometric)
- **Data Export**: User can export all data as JSON
- **Data Backup**: Local backup to device storage, optional cloud backup
- **No Tracking**: No analytics, no ads, no third-party data sharing

---

## Performance Targets

- **App Launch**: < 2 seconds
- **Search Results**: < 500ms for 1000 items
- **List Scroll**: 60 FPS (smooth scrolling)
- **Item Save**: < 1 second (local storage)
- **Sync**: < 5 seconds for 100 items (when online)

---

## Next Steps

This design document guides the implementation of Knowledge Vault's MVP. All screens follow iOS HIG principles, prioritize one-handed usage, and minimize friction in the capture-organize-search-review workflow.
