import { useCallback, useEffect, useState } from 'react';
import type { ViewName } from './appState';

const VALID_VIEWS: ViewName[] = ['applications', 'import', 'profile', 'estimate', 'compare', 'model-config', 'about'];

function readHash(): ViewName {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return (VALID_VIEWS as string[]).includes(raw) ? (raw as ViewName) : 'applications';
}

/** Minimal hash-based router — every nav item is a real, bookmarkable route with no extra dependency. */
export function useHashRoute(): [ViewName, (view: ViewName) => void] {
  const [view, setView] = useState<ViewName>(readHash());

  useEffect(() => {
    const onHashChange = () => setView(readHash());
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) window.location.hash = '#/applications';
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: ViewName) => {
    window.location.hash = `#/${next}`;
  }, []);

  return [view, navigate];
}
