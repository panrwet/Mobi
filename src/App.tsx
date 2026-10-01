import { useEffect, useState } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BottomNav } from './components/Layout';
import { ToastProvider } from './components/ui';
import { getEinstellungen } from './db/actions';
import { schutzEingerichtet } from './db/schutz';
import { initDatenbank } from './db/seed';
import { Entsperren, SchutzEinrichten, useAutoSperre } from './components/Sperre';
import { useEinstellungen } from './lib/hooks';
import { ladePdfModul } from './lib/pdfLazy';
import { applyTheme, Einstellungen } from './pages/Einstellungen';
import { Kalender } from './pages/Kalender';
import { KVForm } from './pages/KVForm';
import { Info, Mehr } from './pages/Mehr';
import { PatientDetail, PatientenListe, PatientForm } from './pages/Patienten';
import { RechnungDetail, RechnungenListe } from './pages/Rechnungen';
import { RezeptDetail } from './pages/RezeptDetail';
import { RezeptForm, RezepteListe } from './pages/Rezepte';
import { Stammdaten } from './pages/Stammdaten';
import { Start } from './pages/Start';
import { BerichtForm } from './pages/BerichtForm';
import { Statistik } from './pages/Statistik';
import { Suche } from './pages/Suche';
import { TerminForm } from './pages/TerminForm';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

type Zustand = 'laden' | 'einrichten' | 'gesperrt' | 'bereit';

export function App() {
  const [zustand, setZustand] = useState<Zustand>('laden');
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    getEinstellungen()
      .then((e) => applyTheme(e.theme))
      .then(schutzEingerichtet)
      .then((ja) => setZustand(ja ? 'gesperrt' : 'einrichten'))
      .catch((e: Error) => setFehler(e.message));
  }, []);

  const entsperrt = () => {
    initDatenbank()
      .then(() => {
        setZustand('bereit');
        // PDF-Modul im Hintergrund vorladen, damit PDFs ohne Verzögerung öffnen
        window.setTimeout(ladePdfModul, 1500);
      })
      .catch((e: Error) => setFehler(e.message));
  };

  if (fehler) return <div className="content">Datenbank konnte nicht geöffnet werden: {fehler}</div>;
  if (zustand === 'laden') return <div className="content muted">Lade …</div>;
  if (zustand === 'einrichten') return <SchutzEinrichten onFertig={entsperrt} />;
  if (zustand === 'gesperrt') return <Entsperren onFertig={entsperrt} />;
  return <Hauptansicht />;
}

function Hauptansicht() {
  const e = useEinstellungen();
  useAutoSperre(e.autoSperreMin);
  return (
    <HashRouter>
      <ToastProvider>
        <ScrollTop />
        <div className="app">
          <Routes>
            <Route path="/" element={<Start />} />
            <Route path="/suche" element={<Suche />} />
            <Route path="/patienten" element={<PatientenListe />} />
            <Route path="/patienten/neu" element={<PatientForm />} />
            <Route path="/patienten/:id" element={<PatientDetail />} />
            <Route path="/patienten/:id/bearbeiten" element={<PatientForm />} />
            <Route path="/rezepte" element={<RezepteListe />} />
            <Route path="/rezepte/neu" element={<RezeptForm />} />
            <Route path="/rezepte/:id" element={<RezeptDetail />} />
            <Route path="/rezepte/:id/bearbeiten" element={<RezeptForm />} />
            <Route path="/rezepte/:id/kv" element={<KVForm />} />
            <Route path="/rezepte/:id/bericht/:bid" element={<BerichtForm />} />
            <Route path="/termine/neu" element={<TerminForm />} />
            <Route path="/termine/:id" element={<TerminForm />} />
            <Route path="/kalender" element={<Kalender />} />
            <Route path="/rechnungen" element={<RechnungenListe />} />
            <Route path="/rechnungen/:id" element={<RechnungDetail />} />
            <Route path="/statistik" element={<Statistik />} />
            <Route path="/stammdaten" element={<Stammdaten />} />
            <Route path="/einstellungen" element={<Einstellungen />} />
            <Route path="/mehr" element={<Mehr />} />
            <Route path="/info" element={<Info />} />
            <Route path="*" element={<Start />} />
          </Routes>
          <BottomNav />
        </div>
      </ToastProvider>
    </HashRouter>
  );
}
