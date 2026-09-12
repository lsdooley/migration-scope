import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  title: string;
  description: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
}) {
  return (
    <div className="ms-card" style={{ textAlign: 'center', padding: 'var(--ms-space-6)' }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={{ color: 'var(--ms-text-muted)' }}>{description}</p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--ms-space-3)', flexWrap: 'wrap' }}>
        {primaryAction}
        {secondaryAction}
      </div>
    </div>
  );
}
