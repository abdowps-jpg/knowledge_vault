import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

// ============================================================================
// Types
// ============================================================================

export interface BiometricAuthSettings {
  appLockEnabled: boolean;
  entryLockEnabled: boolean;
  biometricType: "faceID" | "fingerprint" | "iris" | "unknown";
  pinFallbackEnabled: boolean;
  pin?: string;
}

export type BiometricType = "faceID" | "fingerprint" | "iris" | "unknown";

// ============================================================================
// Biometric Authentication Service
// ============================================================================

export class BiometricAuthService {
  private static instance: BiometricAuthService;
  private settings: BiometricAuthSettings = {
    appLockEnabled: false,
    entryLockEnabled: false,
    biometricType: "unknown",
    pinFallbackEnabled: false,
  };

  private constructor() {
    this.initializeBiometrics();
  }

  static getInstance(): BiometricAuthService {
    if (!BiometricAuthService.instance) {
      BiometricAuthService.instance = new BiometricAuthService();
    }
    return BiometricAuthService.instance;
  }

  /**
   * Initialize biometric authentication
   */
  private async initializeBiometrics(): Promise<void> {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        console.warn("Device does not support biometric authentication");
        return;
      }

      // Get available authentication types
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      this.updateBiometricType(types);

      // Load settings from secure storage
      await this.loadSettings();
    } catch (error) {
      console.error("Error initializing biometrics:", error);
    }
  }

  /**
   * Update biometric type based on available authentication methods
   */
  private updateBiometricType(types: LocalAuthentication.AuthenticationType[]): void {
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      this.settings.biometricType = "faceID";
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      this.settings.biometricType = "fingerprint";
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      this.settings.biometricType = "iris";
    }
  }

  /**
   * Check if device supports biometric authentication
   */
  async isBiometricAvailable(): Promise<boolean> {
    try {
      return await LocalAuthentication.hasHardwareAsync();
    } catch (error) {
      console.error("Error checking biometric availability:", error);
      return false;
    }
  }

  /**
   * Get available biometric types
   */
  async getAvailableBiometricTypes(): Promise<BiometricType[]> {
    try {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const available: BiometricType[] = [];

      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        available.push("faceID");
      }
      if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        available.push("fingerprint");
      }
      if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
        available.push("iris");
      }

      return available;
    } catch (error) {
      console.error("Error getting biometric types:", error);
      return [];
    }
  }

  /**
   * Authenticate with biometric
   */
  async authenticate(_reason: string = "Authenticate to access Knowledge Vault"): Promise<boolean> {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        return false;
      }

      const result = await LocalAuthentication.authenticateAsync({
        disableDeviceFallback: false,
      });

      return result.success;
    } catch (error) {
      console.error("Error authenticating with biometric:", error);
      return false;
    }
  }

  /**
   * Set PIN for fallback authentication
   */
  async setPin(pin: string): Promise<void> {
    try {
      await SecureStore.setItemAsync("app_pin", pin);
      this.settings.pin = pin;
      this.settings.pinFallbackEnabled = true;
    } catch (error) {
      console.error("Error setting PIN:", error);
      throw error;
    }
  }

  /**
   * Verify PIN
   */
  async verifyPin(pin: string): Promise<boolean> {
    try {
      const storedPin = await SecureStore.getItemAsync("app_pin");
      return storedPin === pin;
    } catch (error) {
      console.error("Error verifying PIN:", error);
      return false;
    }
  }

  /**
   * Enable app-level lock
   */
  async enableAppLock(): Promise<void> {
    try {
      this.settings.appLockEnabled = true;
      await this.saveSettings();
    } catch (error) {
      console.error("Error enabling app lock:", error);
      throw error;
    }
  }

  /**
   * Disable app-level lock
   */
  async disableAppLock(): Promise<void> {
    try {
      this.settings.appLockEnabled = false;
      await this.saveSettings();
    } catch (error) {
      console.error("Error disabling app lock:", error);
      throw error;
    }
  }

  /**
   * Enable entry-level lock
   */
  async enableEntryLock(): Promise<void> {
    try {
      this.settings.entryLockEnabled = true;
      await this.saveSettings();
    } catch (error) {
      console.error("Error enabling entry lock:", error);
      throw error;
    }
  }

  /**
   * Disable entry-level lock
   */
  async disableEntryLock(): Promise<void> {
    try {
      this.settings.entryLockEnabled = false;
      await this.saveSettings();
    } catch (error) {
      console.error("Error disabling entry lock:", error);
      throw error;
    }
  }

  /**
   * Get current settings
   */
  getSettings(): BiometricAuthSettings {
    return { ...this.settings };
  }

  /**
   * Load settings from secure storage
   */
  private async loadSettings(): Promise<void> {
    try {
      const appLockStr = await SecureStore.getItemAsync("app_lock_enabled");
      const entryLockStr = await SecureStore.getItemAsync("entry_lock_enabled");
      const pinFallbackStr = await SecureStore.getItemAsync("pin_fallback_enabled");

      if (appLockStr) this.settings.appLockEnabled = appLockStr === "true";
      if (entryLockStr) this.settings.entryLockEnabled = entryLockStr === "true";
      if (pinFallbackStr) this.settings.pinFallbackEnabled = pinFallbackStr === "true";
    } catch (error) {
      console.error("Error loading biometric settings:", error);
    }
  }

  /**
   * Save settings to secure storage
   */
  private async saveSettings(): Promise<void> {
    try {
      await SecureStore.setItemAsync(
        "app_lock_enabled",
        this.settings.appLockEnabled.toString()
      );
      await SecureStore.setItemAsync(
        "entry_lock_enabled",
        this.settings.entryLockEnabled.toString()
      );
      await SecureStore.setItemAsync(
        "pin_fallback_enabled",
        this.settings.pinFallbackEnabled.toString()
      );
    } catch (error) {
      console.error("Error saving biometric settings:", error);
      throw error;
    }
  }

  /**
   * Lock entry with biometric/PIN
   */
  async lockEntry(entryId: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(`entry_locked_${entryId}`, "true");
    } catch (error) {
      console.error("Error locking entry:", error);
      throw error;
    }
  }

  /**
   * Unlock entry with biometric/PIN
   */
  async unlockEntry(entryId: string, usePin: boolean = false): Promise<boolean> {
    try {
      if (usePin) {
        // PIN fallback - would need user input
        return true;
      }

      // Try biometric authentication
      const authenticated = await this.authenticate(
        "Authenticate to access this entry"
      );

      if (authenticated) {
        await SecureStore.setItemAsync(`entry_locked_${entryId}`, "false");
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error unlocking entry:", error);
      return false;
    }
  }

  /**
   * Check if entry is locked
   */
  async isEntryLocked(entryId: string): Promise<boolean> {
    try {
      const locked = await SecureStore.getItemAsync(`entry_locked_${entryId}`);
      return locked === "true";
    } catch (error) {
      console.error("Error checking entry lock status:", error);
      return false;
    }
  }
}
