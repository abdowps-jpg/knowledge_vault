import { useEffect, useState } from "react";
import { loadAppSettings } from "@/lib/settings-storage";

export function useAiEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(true);
  useEffect(() => {
    let active = true;
    loadAppSettings()
      .then((s) => {
        if (active) setEnabled(s.aiFeaturesEnabled !== false);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return enabled;
}
