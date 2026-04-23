/**
 * Global toast queue. Works from anywhere (components, async flows,
 * error handlers) via the `toast` object. `<ToastHost />` in _layout.tsx
 * subscribes and renders the stack.
 */

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

type Listener = (toasts: Toast[]) => void;

const DEFAULT_DURATION_MS: Record<ToastVariant, number> = {
  success: 2500,
  info: 3000,
  warning: 4000,
  error: 5000,
};

const MAX_VISIBLE = 3;

class ToastManager {
  private toasts: Toast[] = [];
  private listeners = new Set<Listener>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  show(message: string, variant: ToastVariant = "info", durationMs?: number): string {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const dur = durationMs ?? DEFAULT_DURATION_MS[variant];
    const next = [...this.toasts, { id, message, variant }];
    // Keep only the most recent MAX_VISIBLE entries.
    this.toasts = next.slice(-MAX_VISIBLE);
    if (dur > 0) {
      this.timers.set(
        id,
        setTimeout(() => this.dismiss(id), dur)
      );
    }
    this.emit();
    return id;
  }

  dismiss(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    if (!this.toasts.some((t) => t.id === id)) return;
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.emit();
  }

  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    if (this.toasts.length === 0) return;
    this.toasts = [];
    this.emit();
  }

  getSnapshot(): Toast[] {
    return this.toasts;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const l of this.listeners) l(this.toasts);
  }
}

export const toastManager = new ToastManager();

export const toast = {
  success: (message: string, durationMs?: number) => toastManager.show(message, "success", durationMs),
  error: (message: string, durationMs?: number) => toastManager.show(message, "error", durationMs),
  info: (message: string, durationMs?: number) => toastManager.show(message, "info", durationMs),
  warning: (message: string, durationMs?: number) => toastManager.show(message, "warning", durationMs),
  dismiss: (id: string) => toastManager.dismiss(id),
  clear: () => toastManager.clear(),
};
