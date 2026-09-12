import type { Provenance } from '../model/types';

const LABELS: Record<Provenance, string> = {
  CMDB: 'CMDB',
  Derived: 'Derived',
  'User confirmed': 'User confirmed',
  'User corrected': 'User corrected',
  Unknown: 'Unknown',
};

export function ProvenanceBadge({ source, timestamp }: { source: Provenance; timestamp?: string | null }) {
  const cls = source === 'Unknown' ? 'ms-badge ms-badge-warning' : 'ms-badge';
  return (
    <span className={cls} title={timestamp ? `Source timestamp: ${timestamp}` : undefined}>
      {LABELS[source]}
    </span>
  );
}
