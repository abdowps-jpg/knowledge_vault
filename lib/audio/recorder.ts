import * as FileSystem from "expo-file-system/legacy";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// Types
// ============================================================================

export interface RecordingSession {
  uri: string;
  duration: number;
  filename: string;
}

// ============================================================================
// Audio Recorder Service (Placeholder)
// ============================================================================

// Note: Audio recording functionality will be implemented in Phase 2
// For MVP, we're providing placeholder functions that can be expanded later

let recordingInProgress = false;

export async function initializeAudio() {
  try {
    // TODO: Initialize expo-audio with proper configuration
    console.log("Audio initialized");
  } catch (error) {
    console.error("Error initializing audio:", error);
    throw error;
  }
}

export async function startRecording(): Promise<void> {
  try {
    recordingInProgress = true;
    console.log("Recording started");
  } catch (error) {
    console.error("Error starting recording:", error);
    throw error;
  }
}

export async function stopRecording(): Promise<RecordingSession | null> {
  try {
    if (!recordingInProgress) {
      console.warn("No recording in progress");
      return null;
    }

    recordingInProgress = false;

    // Create placeholder recording session
    const filename = `recording_${uuidv4()}.m4a`;
    const newPath = `${FileSystem.documentDirectory}recordings/${filename}`;

    // Ensure directory exists
    const recordingsDir = `${FileSystem.documentDirectory}recordings`;
    try {
      await FileSystem.makeDirectoryAsync(recordingsDir, { intermediates: true });
    } catch (e) {
      // Directory might already exist
    }

    return {
      uri: newPath,
      duration: 0,
      filename,
    };
  } catch (error) {
    console.error("Error stopping recording:", error);
    recordingInProgress = false;
    throw error;
  }
}

export async function cancelRecording(): Promise<void> {
  try {
    recordingInProgress = false;
    console.log("Recording cancelled");
  } catch (error) {
    console.error("Error canceling recording:", error);
  }
}

export async function deleteRecording(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri);
  } catch (error) {
    console.error("Error deleting recording:", error);
    throw error;
  }
}

export function isRecording(): boolean {
  return recordingInProgress;
}

// ============================================================================
// Audio Transcription (Placeholder for future integration)
// ============================================================================

export async function transcribeAudio(audioUri: string): Promise<string> {
  try {
    // TODO: Integrate with server-side speech-to-text API
    // This will be implemented in Phase 2 with proper expo-audio integration
    console.log("Transcribing audio:", audioUri);
    return "[Audio transcription coming in Phase 2]";
  } catch (error) {
    console.error("Error transcribing audio:", error);
    throw error;
  }
}
