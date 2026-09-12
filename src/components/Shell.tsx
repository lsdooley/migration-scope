import { useEffect, useState, type ReactNode } from 'react';
import {
  Building2, Upload, IdCard, Calculator, GitCompare, Settings, Info, Menu, X, Sun, Moon, Laptop,
} from 'lucide-react';
import type { ViewName } from '../state/appState';
import { useAppState } from '../state/appState';
import { daysBetween } from '../model/normalizer';
import { MODEL_VERSION } from '../model/modelConfig';
import { Toasts } from './Toasts';

const NAV_ITEMS: { view: ViewName; label: string; icon: typeof Building2 }[] = [
  { view: 'applications', label: 'Applications', icon: Building2 },
  { view: 'import', label: 'Import data', icon: Upload },
  { view: 'profile', label: 'Application profile', icon: IdCard },
  { view: 'estimate', label: 'Estimate workspace', icon: Calculator },
  { view: 'compare', label: 'Compare paths', icon: GitCompare },
  { view: 'model-config', label: 'Model configuration', icon: Settings },
  { view: 'about', label: 'About and provenance', icon: Info },
];

export function Shell({ view, onNavigate, children }: { view: ViewName; onNavigate: (v: ViewName) => void; children: ReactNode }) {
  const { selectedApplication, theme, setTheme, syntheticDataLoaded } = useAppState();
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  const freshnessDays = selectedApplication ? daysBetween(selectedApplication.lastVerifiedDate) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <a href="#ms-main" className="ms-skip-link">Skip to main content</a>

      <header
        style={{
          position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 'var(--ms-space-3)',
          padding: 'var(--ms-space-3) var(--ms-space-5)', background: 'var(--ms-bg-elevated)', borderBottom: '1px solid var(--ms-border)',
          minHeight: 'var(--ms-target-min)', flexWrap: 'wrap',
        }}
      >
        <button
          className="ms-icon-btn"
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((v) => !v)}
          style={{ display: 'none' }}
          id="ms-mobile-menu-toggle"
        >
          {mobileMenuOpen ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
        </button>
        <strong style={{ fontSize: '1.15rem', letterSpacing: '-0.01em' }}>MigrationScope</strong>
        <span className="ms-badge" title="Model configuration version">{MODEL_VERSION}</span>
        {syntheticDataLoaded && <span className="ms-badge ms-badge-synthetic">Synthetic ServiceNow test data</span>}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--ms-space-3)', flexWrap: 'wrap' }}>
          {selectedApplication ? (
            <span style={{ fontSize: '0.9rem' }}>
              Selected: <strong>{selectedApplication.applicationName}</strong>
              {' · '}
              {freshnessDays == null ? (
                <span className="ms-badge ms-badge-warning">Freshness unknown</span>
              ) : freshnessDays > 365 ? (
                <span className="ms-badge ms-badge-warning">Stale · {freshnessDays}d</span>
              ) : (
                <span className="ms-badge">Fresh · {freshnessDays}d</span>
              )}
            </span>
          ) : (
            <span style={{ fontSize: '0.9rem', color: 'var(--ms-text-muted)' }}>No application selected</span>
          )}

          <div role="group" aria-label="Theme" style={{ display: 'flex', gap: 2, background: 'var(--ms-bg-sunken)', borderRadius: 'var(--ms-radius-md)', padding: 2 }}>
            <button className="ms-icon-btn" aria-pressed={theme === 'light'} onClick={() => setTheme('light')} aria-label="Light theme" title="Light theme">
              <Sun size={18} aria-hidden />
            </button>
            <button className="ms-icon-btn" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')} aria-label="Dark theme" title="Dark theme">
              <Moon size={18} aria-hidden />
            </button>
            <button className="ms-icon-btn" aria-pressed={theme === 'system'} onClick={() => setTheme('system')} aria-label="System theme" title="Match system">
              <Laptop size={18} aria-hidden />
            </button>
          </div>
          <button className="ms-btn ms-btn-secondary" onClick={() => onNavigate('about')}>Help / About</button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <nav
          aria-label="Primary"
          data-mobile-open={mobileMenuOpen}
          id="ms-primary-nav"
          style={{
            width: railCollapsed ? 68 : 248,
            flexShrink: 0,
            background: 'var(--ms-bg)',
            padding: 'var(--ms-space-4) var(--ms-space-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--ms-space-1)',
          }}
        >
          <button
            className="ms-icon-btn"
            onClick={() => setRailCollapsed((v) => !v)}
            aria-label={railCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            style={{ alignSelf: 'flex-end', marginBottom: 'var(--ms-space-3)' }}
          >
            <Menu size={18} aria-hidden />
          </button>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV_ITEMS.map(({ view: v, label, icon: Icon }) => (
              <li key={v}>
                <button
                  className={`ms-nav-btn${view === v ? ' is-active' : ''}`}
                  aria-current={view === v ? 'page' : undefined}
                  onClick={() => {
                    onNavigate(v);
                    setMobileMenuOpen(false);
                  }}
                  style={{ justifyContent: railCollapsed ? 'center' : 'flex-start' }}
                  title={label}
                >
                  <Icon size={18} aria-hidden style={{ flexShrink: 0 }} />
                  {!railCollapsed && <span>{label}</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main id="ms-main" tabIndex={-1} style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 'var(--ms-space-5)' }}>
          {children}
        </main>
      </div>

      <Toasts />

      <style>{`
        @media (max-width: 768px) {
          #ms-mobile-menu-toggle { display: inline-flex !important; }
          #ms-primary-nav {
            position: fixed; inset: 0 auto 0 0; z-index: 30; transform: translateX(-100%);
            transition: transform 0.2s ease; width: 260px !important; box-shadow: var(--ms-shadow-md);
          }
          #ms-primary-nav[data-mobile-open="true"] { transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          #ms-primary-nav { transition: none; }
        }
      `}</style>
    </div>
  );
}
