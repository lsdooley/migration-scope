import { X } from 'lucide-react';
import { useAppState } from '../state/appState';

// Toasts acknowledge background events only — important failures are always
// rendered inline in the view itself, never toast-only.
export function Toasts() {
  const { toasts, dismissToast } = useAppState();
  if (toasts.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ position: 'fixed', bottom: 'var(--ms-space-4)', right: 'var(--ms-space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--ms-space-2)', zIndex: 40 }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="ms-card"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--ms-space-2)', padding: 'var(--ms-space-2) var(--ms-space-3)', maxWidth: 360 }}
        >
          <span>{t.message}</span>
          <button className="ms-btn ms-btn-secondary" style={{ padding: 4, minHeight: 32, minWidth: 32 }} onClick={() => dismissToast(t.id)} aria-label="Dismiss notification">
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
