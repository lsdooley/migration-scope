import { AppStateProvider } from './state/appState';
import { useHashRoute } from './state/useHashRoute';
import { Shell } from './components/Shell';
import { ApplicationsView } from './views/ApplicationsView';
import { ImportView } from './views/ImportView';
import { ProfileView } from './views/ProfileView';
import { EstimateWorkspaceView } from './views/EstimateWorkspaceView';
import { CompareView } from './views/CompareView';
import { ModelConfigView } from './views/ModelConfigView';
import { AboutView } from './views/AboutView';

function Router() {
  const [view, navigate] = useHashRoute();

  return (
    <Shell view={view} onNavigate={navigate}>
      {view === 'applications' && <ApplicationsView onNavigate={navigate} />}
      {view === 'import' && <ImportView />}
      {view === 'profile' && <ProfileView onNavigate={navigate} />}
      {view === 'estimate' && <EstimateWorkspaceView onNavigate={navigate} />}
      {view === 'compare' && <CompareView onNavigate={navigate} />}
      {view === 'model-config' && <ModelConfigView />}
      {view === 'about' && <AboutView />}
    </Shell>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <Router />
    </AppStateProvider>
  );
}
