import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import styles from './Toast.module.css';

const ToastContext = createContext<(message: string) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMessage(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {message ? <div className={styles.toast}>{message}</div> : null}
      </div>
    </ToastContext.Provider>
  );
}
