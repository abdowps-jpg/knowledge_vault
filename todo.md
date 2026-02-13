# Knowledge Vault - Project TODO

## Phase 1: Core Setup & Inbox (Week 1)

### Database & Storage
- [x] Set up SQLite database schema with all entities (Item, Quote, Note, Task, JournalEntry, Tag, Category, Attachment, ReviewSchedule)
- [x] Implement AsyncStorage wrapper for offline-first persistence
- [ ] Create migration system for schema updates
- [ ] Implement local backup/export functionality

### Inbox Screen
- [x] Design and implement Inbox screen layout with header and FAB
- [x] Create list component for displaying inbox items with type icons
- [x] Implement item type icons and labels (Note, Quote, Link, Audio, Task, Journal)
- [x] Add pull-to-refresh functionality
- [x] Implement swipe/delete actions
- [x] Add long-press context menu with Move to Library, Convert to Task options
- [x] Implement move to Library functionality
- [x] Implement convert to Task functionality

### Quick Add Feature
- [x] Create Quick Add modal/bottom sheet with tabs (Note, Quote, Link, Audio, Task)
- [x] Implement text input for notes/quotes with character counter
- [x] Implement link input with URL validation
- [x] Implement audio recording UI with record/stop/play buttons
- [x] Add save functionality to Inbox with success feedback
- [x] Implement move to Library from Inbox
- [x] Implement convert to Task from Inbox
- [ ] Test offline functionality

### Audio Recording & Transcription
- [x] Create audio recording modal component
- [x] Implement record/stop/play controls
- [x] Add duration timer and display
- [x] Implement transcription display and editing
- [x] Integrate audio recorder into Quick Add modal
- [ ] Integrate expo-audio for actual recording
- [ ] Implement audio file storage
- [ ] Integrate speech-to-text API (using server LLM)

---

## Phase 2: Library & Actions (Week 2)

### Library Screen
- [x] Design and implement Library screen layout
- [x] Create category/tag filter bar
- [ ] Implement category management (CRUD)
- [ ] Implement tag management (CRUD)
- [x] Add favorites functionality
- [ ] Add archive/restore functionality
- [ ] Implement bulk actions (select multiple, archive, delete, tag)
- [x] Add search/filter by text in library

### Actions Screen (Task Management)
- [x] Design and implement Actions screen layout
- [x] Create task list with sorting (due date, priority)
- [ ] Implement task creation form
- [ ] Add due date picker
- [x] Add priority selector (Low, Medium, High)
- [ ] Implement recurrence patterns (daily, weekly, monthly)
- [ ] Add subtask functionality
- [x] Implement task completion checkbox
- [ ] Add task editing functionality
- [x] Implement task deletion

### Item Detail Screen
- [ ] Create detail view for all item types
- [ ] Implement edit functionality
- [ ] Add tag management in detail view
- [ ] Add category assignment in detail view
- [ ] Implement attachment viewing/management
- [ ] Add delete functionality
- [ ] Add move to archive functionality

### Task Detail Screen
- [ ] Create task detail view
- [ ] Implement all task fields (title, description, due date, priority, recurrence)
- [ ] Add subtask list and creation
- [ ] Implement task editing
- [ ] Add completion toggle

---

## Phase 3: Journal, Search & Notifications (Week 3)

### Journal Screen
- [x] Design and implement Journal screen layout
- [x] Create calendar view component
- [x] Implement date selection
- [x] Create journal entry list for selected date
- [x] Add journal entry creation form
- [x] Implement mood selector (emoji/scale)
- [x] Add optional location capture
- [ ] Add optional weather display
- [ ] Implement photo attachment
- [ ] Implement audio recording for journal entries
- [ ] Add entry lock/privacy toggle
- [ ] Create journal templates

### Journal Entry Detail Screen
- [ ] Create detail view for journal entries
- [ ] Implement full entry editing
- [ ] Add attachment management
- [ ] Implement lock/unlock with biometric auth
- [ ] Add mood/location/weather editing

### Search Screen
- [x] Design and implement Search screen layout
- [x] Implement real-time search functionality
- [x] Create filter chips (Type, Date, Tag, Status)
- [x] Implement type filtering
- [ ] Implement date range filtering
- [ ] Implement tag filtering
- [ ] Implement status filtering (for tasks)
- [ ] Display search results with highlighting
- [x] Add empty state for no results

### Notifications System
- [x] Implement task reminder notifications
- [x] Set up notification scheduling
- [x] Create notification settings UI
- [x] Implement spaced repetition algorithm (SM-2)
- [x] Implement spaced repetition notifications
- [x] Add notification permission handling
- [ ] Test notifications on iOS and Android

### Settings Screen
- [x] Design and implement Settings screen layout
- [ ] Create account section (username, email, password)
- [x] Implement notification preferences
- [x] Add privacy settings (biometric lock, entry lock)
- [x] Implement data export functionality
- [x] Implement data backup functionality
- [ ] Add sync settings (if backend enabled)
- [x] Create about section (version, links, contact)

### Biometric Authentication
- [x] Integrate expo-secure-store for secure storage
- [x] Implement app-level biometric lock
- [x] Implement entry-level biometric lock
- [x] Add fallback PIN option

---

## Phase 4: Polish & Testing

### UI/UX Polish
- [ ] Add loading states to all async operations
- [ ] Implement error handling and user-friendly error messages
- [ ] Add empty states for all list screens
- [ ] Implement haptic feedback for interactions
- [ ] Add animations (screen transitions, list updates)
- [ ] Test dark mode on all screens
- [ ] Ensure responsive layout on different screen sizes

### Testing
- [ ] Write unit tests for database operations
- [ ] Write unit tests for business logic (spaced repetition, filtering)
- [ ] Test all user flows end-to-end
- [ ] Test offline functionality
- [ ] Test sync functionality (if backend enabled)
- [ ] Test on iOS device/simulator
- [ ] Test on Android device/simulator
- [ ] Test on web browser

### Performance Optimization
- [ ] Optimize list rendering (FlatList, pagination)
- [ ] Optimize search performance
- [ ] Optimize database queries
- [ ] Profile app startup time
- [ ] Profile memory usage

### Accessibility
- [ ] Add VoiceOver labels to all interactive elements
- [ ] Test with screen reader
- [ ] Ensure color contrast meets WCAG AA standards
- [ ] Test with system font size settings
- [ ] Test with reduced motion settings

---

## Phase 5: Deployment & Documentation

### Documentation
- [ ] Update README with setup instructions
- [ ] Document API endpoints (if backend used)
- [ ] Create user guide/help documentation
- [ ] Document data schema
- [ ] Create troubleshooting guide

### Deployment
- [ ] Create production build for iOS
- [ ] Create production build for Android
- [ ] Set up TestFlight for iOS beta testing
- [ ] Set up Google Play beta testing for Android
- [ ] Prepare app store listings (descriptions, screenshots)
- [ ] Submit to Apple App Store
- [ ] Submit to Google Play Store

---

## Known Issues & Bugs

(To be updated as issues are discovered during development)

---

## Completed Features

(Items will be moved here as they are completed)

## Phase 5: Audio Recording & Transcription

### Real Audio Recording
- [x] Integrate expo-audio for actual recording
- [x] Implement audio file storage with unique naming
- [x] Add audio playback with duration tracking
- [ ] Implement audio waveform visualization
- [x] Add record/stop/pause controls
- [ ] Integrate server LLM for speech-to-text transcription
- [ ] Display transcription in real-time
- [x] Add automatic audio file cleanup on discard
- [ ] Implement audio file size limits

---

## Phase 6: Cloud Sync

### Backend Integration
- [ ] Set up Drizzle ORM schema for cloud storage
- [ ] Create API endpoints for CRUD operations
- [ ] Implement user authentication with OAuth
- [ ] Add data encryption for sensitive fields

### Sync Mechanism
- [x] Implement offline-first sync queue
- [x] Add conflict resolution strategy (last-write-wins)
- [ ] Create background sync service
- [ ] Implement selective sync (choose what to sync)
- [ ] Add sync status indicators in UI
- [ ] Implement bandwidth-aware sync

### Settings Integration
- [ ] Add cloud sync toggle in Settings
- [ ] Create sync status display
- [ ] Add manual sync button
- [ ] Implement sync scheduling options
- [ ] Add data deletion from cloud option

---

## Phase 7: Rich Text Editor

### Markdown Support
- [x] Integrate markdown parser library
- [x] Implement markdown rendering in item display
- [x] Create markdown input with live preview
- [x] Add markdown formatting shortcuts

### Formatting Toolbar
- [x] Create formatting toolbar component
- [x] Implement bold/italic/underline buttons
- [x] Add heading levels (H1-H3)
- [x] Implement bullet/numbered lists
- [x] Add code block formatting
- [x] Implement link insertion
- [x] Add quote formatting

### Editor Features
- [ ] Implement auto-save functionality
- [ ] Add undo/redo support
- [x] Create markdown preview toggle
- [x] Implement text statistics (word count, char count)
- [ ] Add syntax highlighting for code blocks
- [ ] Implement search and replace

---

## Phase 8: Polish & Testing

### Testing
- [ ] Write unit tests for audio service
- [ ] Write integration tests for cloud sync
- [ ] Write tests for rich text editor
- [ ] Perform end-to-end testing
- [ ] Test on iOS and Android devices
- [ ] Test offline functionality
- [ ] Performance testing and optimization

### Polish
- [ ] Add loading animations
- [ ] Implement error handling and user feedback
- [ ] Add haptic feedback for all interactions
- [ ] Optimize app performance
- [ ] Add app icon and splash screen
- [ ] Create app store listings
- [ ] Add onboarding tutorial

### Documentation
- [ ] Create user guide
- [ ] Add in-app help tooltips
- [ ] Document API endpoints
- [ ] Create developer documentation


## Phase 8: Direct Creation & Cross-Section Conversion

### Direct Item Creation
- [x] Add "+" button to Actions screen
- [ ] Add "+" button to Library screen
- [x] Create modal for direct task creation in Actions
- [ ] Create modal for direct item creation in Library
- [x] Implement form validation for new items
- [ ] Add success feedback after creation

### Cross-Section Conversion
- [x] Implement convert Inbox item to Library item
- [x] Implement convert Inbox item to Action task
- [x] Implement convert Library item to Action task
- [x] Implement convert Action task to Library item
- [x] Implement convert Journal entry to Library item
- [x] Create conversion service with all conversion logic
- [x] Create conversion modal component
- [x] Preserve data during conversions (content, tags, etc.)
