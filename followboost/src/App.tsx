import { useEffect } from 'react';
import { Compass } from 'lucide-react';
import { EmptyState } from './components/bits';
import { Shell } from './components/Shell';
import { useRoute, type Route } from './lib/router';
import { StoreProvider } from './state/store';
import { UIProvider } from './state/ui';
import { DashboardView } from './views/DashboardView';
import { GenerateView } from './views/GenerateView';
import { HelpView } from './views/HelpView';
import { HistoryView } from './views/HistoryView';
import { ProcessingModal } from './views/ProcessingModal';
import { RequestDetailView } from './views/RequestDetailView';

const TITLES: Record<Route['name'], string> = {
  generate: 'New request',
  dashboard: 'Dashboard',
  history: 'History',
  help: 'Safety & help',
  request: 'Request',
  notfound: 'Page not found',
};

function View({ route }: { route: Route }) {
  switch (route.name) {
    case 'generate':
      return <GenerateView />;
    case 'dashboard':
      return <DashboardView />;
    case 'history':
      return <HistoryView />;
    case 'help':
      return <HelpView />;
    case 'request':
      return <RequestDetailView id={route.id} />;
    case 'notfound':
      return (
        <div className="view">
          <div className="card pad">
            <EmptyState
              icon={<Compass size={22} />}
              title="Page not found"
              body="That page doesn't exist. Head back and start a new request."
              action={
                <a className="btn btn-primary" href="#/generate">
                  Go to generator
                </a>
              }
            />
          </div>
        </div>
      );
  }
}

export function App() {
  const route = useRoute();

  useEffect(() => {
    const name = route.name === 'request' ? `Request ${route.id}` : TITLES[route.name];
    document.title = `${name} · FollowBoost AI`;
  }, [route]);

  return (
    <StoreProvider>
      <UIProvider>
        <Shell route={route}>
          <View key={route.name === 'request' ? route.id : route.name} route={route} />
        </Shell>
        <ProcessingModal />
      </UIProvider>
    </StoreProvider>
  );
}
