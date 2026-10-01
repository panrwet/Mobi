import { useEffect, useState, type FormEvent } from 'react';
import {
  allesZuruecksetzen,
  entsperren,
  fehlversuche,
  fehlversuchMerken,
  fehlversucheZuruecksetzen,
  MIN_PIN_LAENGE,
  schutzEinrichten,
  sperren,
} from '../db/schutz';
import { Icon } from './Icon';
import { Alert } from './ui';

function Rahmen({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="sperre">
      <div className="sperre-box">
        <div className="sperre-logo">
          <img src="./icon.svg" alt="" width={64} height={64} />
        </div>
        <h1>{titel}</h1>
        {children}
      </div>
    </div>
  );
}

/** Ersteinrichtung der PIN */
export function SchutzEinrichten({ onFertig }: { onFertig: () => void }) {
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  const absenden = async (e: FormEvent) => {
    e.preventDefault();
    if (pin !== pin2) return setFehler('Die PINs stimmen nicht überein.');
    setLaeuft(true);
    try {
      await schutzEinrichten(pin);
      onFertig();
    } catch (err) {
      setFehler((err as Error).message);
      setLaeuft(false);
    }
  };

  return (
    <Rahmen titel="Willkommen bei Mobi">
      <p className="muted">
        Bitte lege eine PIN fest. Mit ihr werden alle Patientendaten auf diesem Gerät verschlüsselt. <b>Ohne PIN sind die Daten nicht wiederherstellbar</b> – bitte gut merken.
      </p>
      <form onSubmit={absenden}>
        <input
          className="input pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          placeholder={`PIN (mind. ${MIN_PIN_LAENGE} Stellen)`}
          aria-label="Neue PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoFocus
        />
        <input
          className="input pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          placeholder="PIN wiederholen"
          aria-label="PIN wiederholen"
          value={pin2}
          onChange={(e) => setPin2(e.target.value)}
        />
        {fehler && <Alert tone="danger">{fehler}</Alert>}
        <button className="btn primary block" disabled={pin.length < MIN_PIN_LAENGE || laeuft}>
          {laeuft ? 'Wird eingerichtet …' : 'PIN festlegen'}
        </button>
      </form>
      <p className="small muted" style={{ marginTop: 16 }}>Testversion: Nach dem Einrichten werden fiktive Beispieldaten geladen.</p>
    </Rahmen>
  );
}

/** Sperrbildschirm */
export function Entsperren({ onFertig }: { onFertig: () => void }) {
  const [pin, setPin] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [jetzt, setJetzt] = useState(Date.now());
  const wartenBis = fehlversuche().gesperrtBis;
  const wartenSek = Math.max(0, Math.ceil((wartenBis - jetzt) / 1000));

  useEffect(() => {
    if (wartenSek <= 0) return;
    const t = window.setInterval(() => setJetzt(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [wartenSek]);

  const absenden = async (e: FormEvent) => {
    e.preventDefault();
    if (wartenSek > 0) return;
    setLaeuft(true);
    try {
      await entsperren(pin);
      fehlversucheZuruecksetzen();
      onFertig();
    } catch (err) {
      fehlversuchMerken();
      setFehler((err as Error).message);
      setPin('');
      setJetzt(Date.now());
      setLaeuft(false);
    }
  };

  const zuruecksetzen = async () => {
    if (!confirm('PIN vergessen? Dabei werden ALLE Daten auf diesem Gerät unwiderruflich gelöscht. (Eine Sicherung kann danach wieder eingespielt werden.)')) return;
    if (!confirm('Wirklich alle Daten löschen?')) return;
    fehlversucheZuruecksetzen();
    await allesZuruecksetzen();
  };

  return (
    <Rahmen titel="Mobi ist gesperrt">
      <form onSubmit={absenden}>
        <input
          className="input pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          placeholder="PIN"
          aria-label="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoFocus
        />
        {fehler && <Alert tone="danger">{fehler}</Alert>}
        {wartenSek > 0 && <Alert>Zu viele Fehlversuche – bitte {wartenSek} s warten.</Alert>}
        <button className="btn primary block" disabled={!pin || laeuft || wartenSek > 0}>
          <Icon name="lock" size={18} /> {laeuft ? 'Entsperre …' : 'Entsperren'}
        </button>
      </form>
      <button className="btn ghost small" style={{ marginTop: 18 }} onClick={zuruecksetzen}>
        PIN vergessen?
      </button>
    </Rahmen>
  );
}

/** Sperrt die App nach Inaktivität bzw. wenn sie länger im Hintergrund war */
export function useAutoSperre(minuten: number) {
  useEffect(() => {
    const grenze = Math.max(1, minuten) * 60_000;
    let letzteAktivitaet = Date.now();
    let verstecktSeit: number | null = null;
    const aktiv = () => {
      letzteAktivitaet = Date.now();
    };
    const sichtbarkeit = () => {
      if (document.hidden) verstecktSeit = Date.now();
      else {
        if (verstecktSeit && Date.now() - verstecktSeit > grenze) sperren();
        verstecktSeit = null;
        aktiv();
      }
    };
    const timer = window.setInterval(() => {
      if (Date.now() - letzteAktivitaet > grenze) sperren();
    }, 15_000);
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, aktiv, { passive: true }));
    document.addEventListener('visibilitychange', sichtbarkeit);
    return () => {
      window.clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, aktiv));
      document.removeEventListener('visibilitychange', sichtbarkeit);
    };
  }, [minuten]);
}
