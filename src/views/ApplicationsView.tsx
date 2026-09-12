import { useMemo, useState } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';
import { useAppState } from '../state/appState';
import type { ViewName } from '../state/appState';
import { syntheticApplications } from '../data/syntheticData';
import { applicationAgeYears } from '../model/normalizer';
import { computeEvidenceQuality } from '../model/dataQuality';
import { EmptyState } from '../components/EmptyState';
import { exportSyntheticApplicationsCsv } from '../exporters/exporters';

type SortKey = 'id' | 'name' | 'criticality' | 'age' | 'upstream' | 'downstream' | 'integrations' | 'rto' | 'evidence';

const CRITICALITY_ORDER = { Unknown: -1, Low: 0, Medium: 1, High: 2, 'Mission-critical': 3 };

export function ApplicationsView({ onNavigate }: { onNavigate: (v: ViewName) => void }) {
  const { applications, loadApplications, selectApplication, estimatesByAppId, profileConfirmedByAppId, modelConfig, pushToast } = useAppState();
  const [search, setSearch] = useState('');
  const [criticalityFilter, setCriticalityFilter] = useState('all');
  const [architectureFilter, setArchitectureFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const rows = useMemo(() => {
    return applications
      .filter((a) => {
        const q = search.trim().toLowerCase();
        if (q && !a.applicationId.toLowerCase().includes(q) && !a.applicationName.toLowerCase().includes(q)) return false;
        if (criticalityFilter !== 'all' && a.businessCriticality !== criticalityFilter) return false;
        if (architectureFilter !== 'all' && a.architectureStyle !== architectureFilter) return false;
        return true;
      })
      .map((a) => ({
        app: a,
        age: applicationAgeYears(a.firstProductionDate),
        evidence: computeEvidenceQuality(a, modelConfig, { profileConfirmed: !!profileConfirmedByAppId[a.applicationId] }).total,
        estimated: Object.keys(estimatesByAppId[a.applicationId] ?? {}).length > 0,
      }))
      .sort((a, b) => {
        const dir = sortDir;
        switch (sortKey) {
          case 'name': return dir * a.app.applicationName.localeCompare(b.app.applicationName);
          case 'criticality': return dir * (CRITICALITY_ORDER[a.app.businessCriticality] - CRITICALITY_ORDER[b.app.businessCriticality]);
          case 'age': return dir * ((a.age ?? -1) - (b.age ?? -1));
          case 'upstream': return dir * ((a.app.upstreamDependencyCount ?? -1) - (b.app.upstreamDependencyCount ?? -1));
          case 'downstream': return dir * ((a.app.downstreamDependencyCount ?? -1) - (b.app.downstreamDependencyCount ?? -1));
          case 'integrations': return dir * ((a.app.integrationCount ?? -1) - (b.app.integrationCount ?? -1));
          case 'rto': return dir * ((a.app.rtoMinutes ?? Infinity) - (b.app.rtoMinutes ?? Infinity));
          case 'evidence': return dir * (a.evidence - b.evidence);
          default: return dir * a.app.applicationId.localeCompare(b.app.applicationId);
        }
      });
  }, [applications, search, criticalityFilter, architectureFilter, sortKey, sortDir, estimatesByAppId, profileConfirmedByAppId, modelConfig]);

  const architectureStyles = useMemo(() => [...new Set(applications.map((a) => a.architectureStyle))], [applications]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  function selectAndGo(appId: string) {
    selectApplication(appId);
    onNavigate('profile');
  }

  if (applications.length === 0) {
    return (
      <EmptyState
        title="No applications loaded yet"
        description="Load the bundled synthetic ServiceNow fixtures to explore MigrationScope, or import your own CMDB export."
        primaryAction={
          <button
            className="ms-btn ms-btn-primary"
            onClick={() => {
              loadApplications(syntheticApplications, { synthetic: true });
              pushToast('Loaded 12 synthetic ServiceNow applications.', 'success');
            }}
          >
            Load synthetic data
          </button>
        }
        secondaryAction={<button className="ms-btn ms-btn-secondary" onClick={() => onNavigate('import')}>Import file</button>}
      />
    );
  }

  return (
    <section aria-labelledby="applications-h1">
      <h1 id="applications-h1">Applications</h1>
      <button className="ms-btn ms-btn-secondary" style={{ marginBottom: 'var(--ms-space-3)' }} onClick={() => exportSyntheticApplicationsCsv(applications)}>
        Export current list as CSV
      </button>

      <div style={{ display: 'flex', gap: 'var(--ms-space-3)', flexWrap: 'wrap', marginBottom: 'var(--ms-space-4)' }}>
        <div className="ms-field" style={{ marginBottom: 0, minWidth: 220 }}>
          <label htmlFor="app-search">Search</label>
          <div style={{ position: 'relative' }}>
            <Search size={16} aria-hidden style={{ position: 'absolute', left: 10, top: 14 }} />
            <input id="app-search" type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ID or name" style={{ paddingLeft: 32 }} />
          </div>
        </div>
        <div className="ms-field" style={{ marginBottom: 0 }}>
          <label htmlFor="criticality-filter">Business criticality</label>
          <select id="criticality-filter" value={criticalityFilter} onChange={(e) => setCriticalityFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Mission-critical">Mission-critical</option>
            <option value="Unknown">Unknown</option>
          </select>
        </div>
        <div className="ms-field" style={{ marginBottom: 0 }}>
          <label htmlFor="architecture-filter">Architecture style</label>
          <select id="architecture-filter" value={architectureFilter} onChange={(e) => setArchitectureFilter(e.target.value)}>
            <option value="all">All</option>
            {architectureStyles.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <p aria-live="polite" className="ms-visually-hidden">{rows.length} applications shown</p>

      <div className="ms-table-wrap ms-table-cards">
        <table className="ms-table">
          <thead>
            <tr>
              <SortableHeader label="ID / Name" onClick={() => toggleSort('name')} />
              <SortableHeader label="Criticality" onClick={() => toggleSort('criticality')} />
              <th scope="col">Language / runtime</th>
              <th scope="col">Architecture</th>
              <SortableHeader label="Age (yrs)" onClick={() => toggleSort('age')} />
              <SortableHeader label="Upstream" onClick={() => toggleSort('upstream')} />
              <SortableHeader label="Downstream" onClick={() => toggleSort('downstream')} />
              <SortableHeader label="Integrations" onClick={() => toggleSort('integrations')} />
              <th scope="col">DR topology</th>
              <SortableHeader label="RTO (min)" onClick={() => toggleSort('rto')} />
              <SortableHeader label="Evidence Quality" onClick={() => toggleSort('evidence')} />
              <th scope="col">Estimate status</th>
              <th scope="col">Select</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ app, age, evidence, estimated }) => (
              <tr key={app.applicationId}>
                <td data-label="ID / Name">
                  <div>{app.applicationId}</div>
                  <div style={{ color: 'var(--ms-text-muted)', fontSize: '0.85rem' }}>{app.applicationName}</div>
                </td>
                <td data-label="Criticality">{app.businessCriticality}</td>
                <td data-label="Language / runtime">{[...app.languages, ...app.runtimePlatforms].filter(Boolean).join(', ') || 'Unknown'}</td>
                <td data-label="Architecture">{app.architectureStyle}</td>
                <td data-label="Age">{age ?? 'Unknown'}</td>
                <td data-label="Upstream">{app.upstreamDependencyCount ?? 'Unknown'}</td>
                <td data-label="Downstream">{app.downstreamDependencyCount ?? 'Unknown'}</td>
                <td data-label="Integrations">{app.integrationCount ?? 'Unknown'}</td>
                <td data-label="DR topology">{app.drTopology}</td>
                <td data-label="RTO">{app.rtoMinutes ?? 'Unknown'}</td>
                <td data-label="Evidence Quality">{evidence.toFixed(0)}</td>
                <td data-label="Estimate status">
                  <span className={estimated ? 'ms-badge' : 'ms-badge ms-badge-warning'}>{estimated ? 'Estimated' : 'Not started'}</span>
                </td>
                <td data-label="Select">
                  <button className="ms-btn ms-btn-secondary" onClick={() => selectAndGo(app.applicationId)}>
                    Select
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SortableHeader({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <th scope="col">
      <button className="ms-btn ms-btn-secondary" style={{ minHeight: 32, padding: '4px 8px', display: 'inline-flex', gap: 4, alignItems: 'center' }} onClick={onClick}>
        {label} <ArrowUpDown size={14} aria-hidden />
      </button>
    </th>
  );
}
