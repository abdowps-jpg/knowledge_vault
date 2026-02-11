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
- [ ] Implement audio recording UI with record/stop/play buttons
- [x] Add save functionality to Inbox with success feedback
- [x] Implement move to Library from Inbox
- [x] Implement convert to Task from Inbox
- [ ] Test offline functionality

### Audio Recording & Transcription
- [ ] Integrate expo-audio for recording
- [ ] Implement audio file storage
- [ ] Integrate speech-to-text API (using server LLM)
- [ ] Display transcribed text in UI
- [ ] Handle audio playback

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
- [ ] Design and implement Journal screen layout
- [ ] Create calendar view component
- [ ] Implement date selection
- [ ] Create journal entry list for selected date
- [ ] Add journal entry creation form
- [ ] Implement mood selector (emoji/scale)
- [ ] Add optional location capture
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
- [ ] Design and implement Search screen layout
- [ ] Implement real-time search functionality
- [ ] Create filter chips (Type, Date, Tag, Status)
- [ ] Implement type filtering
- [ ] Implement date range filtering
- [ ] Implement tag filtering
- [ ] Implement status filtering (for tasks)
- [ ] Display search results with highlighting
- [ ] Add empty state for no results

### Notifications System
- [ ] Implement task reminder notifications
- [ ] Set up notification scheduling
- [ ] Create notification settings UI
- [ ] Implement spaced repetition algorithm (SM-2)
- [ ] Implement spaced repetition notifications
- [ ] Add notification permission handling
- [ ] Test notifications on iOS and Android

### Settings Screen
- [ ] Design and implement Settings screen layout
- [ ] Create account section (username, email, password)
- [ ] Implement notification preferences
- [ ] Add privacy settings (biometric lock, entry lock)
- [ ] Implement data export functionality
- [ ] Implement data backup functionality
- [ ] Add sync settings (if backend enabled)
- [ ] Create about section (version, links, contact)

### Biometric Authentication
- [ ] Integrate expo-secure-store for secure storage
- [ ] Implement app-level biometric lock
- [ ] Implement entry-level biometric lock
- [ ] Add fallback PIN option

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
