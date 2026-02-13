import {
  useAudioRecorder,
  useAudioPlayer,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

// ============================================================================
// Types
// ============================================================================

export interface AudioRecording {
  uri: string;
  duration: number;
  mimeType: string;
  fileSize: number;
  createdAt: Date;
  transcription?: string;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  fileUri?: string;
}

// ============================================================================
// Audio Service (Simplified for expo-audio v1.x)
// ============================================================================

export class AudioService {
  private static instance: AudioService;

  private constructor() {
    this.initializeAudio();
  }

  static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  /**
   * Initialize audio system
   */
  private async initializeAudio(): Promise<void> {
    try {
      // Request permissions
      await this.requestPermissions();
    } catch (error) {
      console.error("Error initializing audio:", error);
    }
  }

  /**
   * Request audio recording and playback permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const recordingPermission = await requestRecordingPermissionsAsync();
      return recordingPermission.granted;
    } catch (error) {
      console.error("Error requesting audio permissions:", error);
      return false;
    }
  }

  /**
   * Format duration in MM:SS format
   */
  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  /**
   * Delete audio file
   */
  async deleteAudioFile(uri: string): Promise<void> {
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch (error) {
      console.error("Error deleting audio file:", error);
    }
  }

  /**
   * Get file size
   */
  async getFileSize(uri: string): Promise<number> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (fileInfo.exists && !fileInfo.isDirectory) {
        // FileInfo doesn't have size property in legacy API
        // Return 0 as placeholder
        return 0;
      }
      return 0;
    } catch (error) {
      console.error("Error getting file size:", error);
      return 0;
    }
  }

  /**
   * Create audio recording directory
   */
  async createRecordingDirectory(): Promise<string> {
    try {
      const recordingDir = `${FileSystem.documentDirectory}recordings/`;
      const dirInfo = await FileSystem.getInfoAsync(recordingDir);

      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(recordingDir, { intermediates: true });
      }

      return recordingDir;
    } catch (error) {
      console.error("Error creating recording directory:", error);
      throw error;
    }
  }

  /**
   * Generate unique recording filename
   */
  generateRecordingFilename(): string {
    const timestamp = Date.now();
    const extension = Platform.OS === "ios" ? "m4a" : "mp3";
    return `recording_${timestamp}.${extension}`;
  }

  /**
   * Clean up old recordings
   */
  async cleanupOldRecordings(daysOld: number = 7): Promise<void> {
    try {
      const recordingDir = `${FileSystem.documentDirectory}recordings/`;
      const files = await FileSystem.readDirectoryAsync(recordingDir);

      for (const file of files) {
        const filePath = `${recordingDir}${file}`;
        const fileInfo = await FileSystem.getInfoAsync(filePath);

        if (fileInfo.exists && !fileInfo.isDirectory) {
          await FileSystem.deleteAsync(filePath, { idempotent: true });
        }
      }
    } catch (error) {
      console.error("Error cleaning up old recordings:", error);
    }
  }
}

// ============================================================================
// Hook-based Audio Recorder Component (for use in React components)
// ============================================================================

/**
 * Hook for managing audio recording
 * Usage: const recorder = useAudioRecorder(options, statusListener);
 */
export { useAudioRecorder, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

/**
 * Export permission request functions
 */
export { requestRecordingPermissionsAsync } from "expo-audio";
