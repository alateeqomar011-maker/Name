import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { BareLayout, Layout } from './components/Layout.tsx';
import { I18nProvider } from './i18n/index.tsx';
import { StoreProvider } from './lib/store.tsx';
import Browse from './pages/Browse.tsx';
import Character from './pages/Character.tsx';
import Home from './pages/Home.tsx';

const Call = lazy(() => import('./pages/Call.tsx'));
const Chat = lazy(() => import('./pages/Chat.tsx'));
const Group = lazy(() => import('./pages/Group.tsx'));
const Favorites = lazy(() => import('./pages/Favorites.tsx'));
const Requests = lazy(() => import('./pages/Requests.tsx'));
const Greeting = lazy(() => import('./pages/Greeting.tsx'));
const Premium = lazy(() => import('./pages/Premium.tsx'));
const Settings = lazy(() => import('./pages/Settings.tsx'));
const Admin = lazy(() => import('./pages/Admin.tsx'));
const History = lazy(() => import('./pages/History.tsx').then((m) => ({ default: m.History })));
const Transcript = lazy(() => import('./pages/History.tsx').then((m) => ({ default: m.Transcript })));
const AboutAI = lazy(() => import('./pages/About.tsx').then((m) => ({ default: m.AboutAI })));
const Rights = lazy(() => import('./pages/About.tsx').then((m) => ({ default: m.Rights })));

function Loading() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
      <div className="spinner" />
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <StoreProvider>
        <BrowserRouter>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route element={<BareLayout />}>
                <Route path="/call/:mode/:id" element={<Call />} />
                <Route path="/call/:mode" element={<Call />} />
              </Route>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="/browse" element={<Browse />} />
                <Route path="/c/:id" element={<Character />} />
                <Route path="/chat/:id" element={<Chat />} />
                <Route path="/group" element={<Group />} />
                <Route path="/favorites" element={<Favorites />} />
                <Route path="/history" element={<History />} />
                <Route path="/history/:id" element={<Transcript />} />
                <Route path="/requests" element={<Requests />} />
                <Route path="/greeting/:id" element={<Greeting />} />
                <Route path="/premium" element={<Premium />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/about-ai" element={<AboutAI />} />
                <Route path="/rights" element={<Rights />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="*" element={<Home />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </StoreProvider>
    </I18nProvider>
  );
}
