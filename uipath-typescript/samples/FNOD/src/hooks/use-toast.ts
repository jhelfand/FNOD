type ToastOptions = {
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
};

export const useToast = () => {
  const toast = (opts: ToastOptions) => {
    // Simple placeholder: console and browser alert (non-blocking)
    console.log('toast', opts);
    try {
      // Use a non-blocking notification if available
      if (typeof window !== 'undefined' && (window as any).Notification) {
        // do not request permissions here; just fallback
      }
    } catch (e) {
      // ignore
    }
  };

  return { toast };
};

export default useToast;
