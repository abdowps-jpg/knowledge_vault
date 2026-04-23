import { useEffect, useState } from "react";
import { toast, toastManager, type Toast } from "@/lib/toast-manager";

export function useToastList(): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>(() => toastManager.getSnapshot());
  useEffect(() => toastManager.subscribe(setToasts), []);
  return toasts;
}

export function useToast() {
  return toast;
}

export { toast };
