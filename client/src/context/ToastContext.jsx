import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const TONES = {
  success: { icon: CheckCircle2, cls: 'border-coop-200 bg-coop-50 text-coop-900', iconCls: 'text-coop-600' },
  error: { icon: AlertTriangle, cls: 'border-red-200 bg-red-50 text-red-900', iconCls: 'text-red-600' },
  info: { icon: Info, cls: 'border-navy-200 bg-white text-navy-900', iconCls: 'text-navy-500' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message, tone = 'info', ttl = 4200) => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, message, tone }]);
      setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      push,
      success: (m) => push(m, 'success'),
      error: (m) => push(m, 'error', 6000),
      info: (m) => push(m, 'info'),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => {
          const tone = TONES[t.tone] ?? TONES.info;
          const Icon = tone.icon;
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex animate-fade-up items-start gap-3 rounded-xl border p-3.5 shadow-lift ${tone.cls}`}
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${tone.iconCls}`} />
              <p className="flex-1 text-sm font-medium leading-snug">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded p-0.5 opacity-50 transition hover:opacity-100"
                aria-label="Dismiss"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
