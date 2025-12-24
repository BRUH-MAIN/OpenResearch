import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (message: string, type: ToastType = 'info', duration: number = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    const toast: Toast = { id, message, type, duration };
    
    set((state) => ({
      toasts: [...state.toasts, toast],
    }));

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }
  },

  removeToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  success: (message: string) => {
    get().addToast(message, 'success');
  },

  error: (message: string) => {
    get().addToast(message, 'error');
  },

  info: (message: string) => {
    get().addToast(message, 'info');
  },

  warning: (message: string) => {
    get().addToast(message, 'warning');
  },
}));

// Helper function for easy access
export const toast = {
  success: (message: string) => useToastStore.getState().success(message),
  error: (message: string) => useToastStore.getState().error(message),
  info: (message: string) => useToastStore.getState().info(message),
  warning: (message: string) => useToastStore.getState().warning(message),
};
