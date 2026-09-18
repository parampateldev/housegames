import { useEffect, useState, createContext, useContext, useCallback, type ReactNode } from 'react';

type ToastCtx = (message: string) => void;
const Ctx = createContext<ToastCtx>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 2400);
    return () => clearTimeout(t);
  }, [message]);

  const show = useCallback((m: string) => setMessage(m), []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {message && <div className="hg-toast">{message}</div>}
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
