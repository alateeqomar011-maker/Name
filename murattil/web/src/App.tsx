import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBox, Loading, ToastHost } from './components/ui';
import { I18nProvider } from './lib/i18n';
import { PlayerProvider } from './lib/player';
import { SessionProvider, useSession } from './lib/session';
import { CoachPage } from './pages/Coach';
import { HomePage } from './pages/Home';
import { NotFound } from './pages/NotFound';
import { ProgressPage } from './pages/Progress';
import { QuranIndex } from './pages/QuranIndex';
import { RecitersPage } from './pages/Reciters';
import { ReciterDetail } from './pages/ReciterDetail';
import { RecordingsPage } from './pages/Recordings';
import { SettingsPage } from './pages/Settings';
import { StudioPage } from './pages/Studio';
import { SurahReader } from './pages/SurahReader';

function ThemeSync() {
  const { settings } = useSession();
  useEffect(() => {
    const pref = (settings.theme as string) || localStorage.getItem('murattil.theme') || 'system';
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);
  useEffect(() => {
    const scale = Number(settings.fontScale) || 1;
    document.documentElement.style.setProperty('--quran-size', `${1.9 * scale}rem`);
  }, [settings.fontScale]);
  return null;
}

function Gate() {
  const { session, error, refresh } = useSession();
  if (error && !session) return <div className="page"><ErrorBox error={error} onRetry={refresh} /></div>;
  if (!session) return <Loading />;
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/quran" element={<QuranIndex />} />
      <Route path="/quran/:surah" element={<SurahReader />} />
      <Route path="/reciters" element={<RecitersPage />} />
      <Route path="/reciters/:id" element={<ReciterDetail />} />
      <Route path="/studio" element={<StudioPage />} />
      <Route path="/coach" element={<CoachPage />} />
      <Route path="/recordings" element={<RecordingsPage />} />
      <Route path="/progress" element={<ProgressPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export function App() {
  return (
    <I18nProvider>
      <SessionProvider>
        <PlayerProvider>
          <BrowserRouter>
            <ThemeSync />
            <Layout>
              <Gate />
            </Layout>
            <ToastHost />
          </BrowserRouter>
        </PlayerProvider>
      </SessionProvider>
    </I18nProvider>
  );
}
