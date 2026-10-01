import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { abgleichen, brauchtPasswort, dateiAusgeben, exportiereDatei, sicherungEinspielen, type AbgleichErgebnis } from '../db/abgleich';
import { allesLoeschen, saveEinstellungen } from '../db/actions';
import { db } from '../db/db';
import { MIN_PIN_LAENGE, pinAendern, sperren } from '../db/schutz';
import { ladeBeispieldaten } from '../db/seed';
import type { Einstellungen as E } from '../db/types';
import { Page } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Alert, Card, Field, ListLink, Sheet, useToast } from '../components/ui';
import { formatDateTime, isoDate } from '../lib/format';
import { useEinstellungen } from '../lib/hooks';

export function Einstellungen() {
  const gespeichert = useEinstellungen();
  const toast = useToast();
  const [e, setE] = useState<E | null>(null);
  const d = e ?? gespeichert;
  const set = (p: Partial<E>) => setE({ ...d, ...p });

  const geraet = useLiveQuery(() => db.meta.get('geraet'), []);
  const [pinSheet, setPinSheet] = useState(false);
  const [exportSheet, setExportSheet] = useState<null | 'sicherung' | 'abgleich'>(null);
  const [importDatei, setImportDatei] = useState<{ text: string; modus: 'ersetzen' | 'abgleich' } | null>(null);
  const [ergebnis, setErgebnis] = useState<AbgleichErgebnis | null>(null);

  const dateiGewaehlt = async (file: File, modus: 'ersetzen' | 'abgleich') => {
    const text = await file.text();
    if (brauchtPasswort(text)) setImportDatei({ text, modus });
    else await importAusfuehren(text, '', modus);
  };

  const importAusfuehren = async (text: string, passwort: string, modus: 'ersetzen' | 'abgleich') => {
    try {
      if (modus === 'ersetzen') {
        if (!confirm('Alle aktuellen Daten werden durch die Sicherung ersetzt. Fortfahren?')) return;
        await sicherungEinspielen(text, passwort);
        toast('Sicherung wiederhergestellt');
      } else {
        setErgebnis(await abgleichen(text, passwort));
      }
      setImportDatei(null);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <Page title="Einstellungen" back>
      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          await saveEinstellungen(d);
          setE(null);
          applyTheme(d.theme);
          toast('Einstellungen gespeichert');
        }}
      >
        <Card title="Abläufe & Fristen">
          <div className="grid2">
            <Field label="Standard-Termindauer (Min.)">
              <input type="number" min={15} step={15} value={d.standardDauerMin} onChange={(ev) => set({ standardDauerMin: Number(ev.target.value) })} />
            </Field>
            <Field label="Zahlungsziel (Tage)">
              <input type="number" min={0} value={d.zahlungszielTage} onChange={(ev) => set({ zahlungszielTage: Number(ev.target.value) })} />
            </Field>
            <Field label="KV-Wiedervorlage nach (Tagen)" hint="Hinweis in der Eingangsliste, wenn der Kostenträger nicht antwortet.">
              <input type="number" min={1} value={d.kvWiedervorlageTage} onChange={(ev) => set({ kvWiedervorlageTage: Number(ev.target.value) })} />
            </Field>
            <Field label="Automatische Sperre nach (Min.)" hint="Nach dieser Zeit ohne Bedienung oder im Hintergrund wird die PIN erneut abgefragt.">
              <input type="number" min={1} max={60} value={d.autoSperreMin} onChange={(ev) => set({ autoSperreMin: Math.max(1, Number(ev.target.value)) })} />
            </Field>
            <Field label="Verordnung gültig (Tage ab Ausstellung)" hint="Hinweis, wenn bis dahin keine Behandlung begonnen hat.">
              <input type="number" min={1} value={d.verordnungGueltigTage} onChange={(ev) => set({ verordnungGueltigTage: Number(ev.target.value) })} />
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={d.zuzahlungAktiv} onChange={(ev) => set({ zuzahlungAktiv: ev.target.checked })} />
            Gesetzliche Zuzahlung (10 %, min. 5 €, max. 10 €) in Rechnungen ausweisen
          </label>
        </Card>
        <Card title="Nummernkreise">
          <p className="small muted" style={{ marginTop: 0 }}>
            Rechnungsnummern müssen fortlaufend und eindeutig sein. Format: Präfix + Jahr + laufende Nummer (z. B. RE-2026-0001).
          </p>
          <div className="grid2">
            <Field label="Präfix Rechnung">
              <input value={d.rechnungPraefix} onChange={(ev) => set({ rechnungPraefix: ev.target.value })} />
            </Field>
            <Field label="Nächste Rechnungsnummer">
              <input type="number" min={1} value={d.naechsteRechnungsnummer} onChange={(ev) => set({ naechsteRechnungsnummer: Number(ev.target.value) })} />
            </Field>
            <Field label="Präfix Kostenvoranschlag">
              <input value={d.kvPraefix} onChange={(ev) => set({ kvPraefix: ev.target.value })} />
            </Field>
            <Field label="Nächste KV-Nummer">
              <input type="number" min={1} value={d.naechsteKvNummer} onChange={(ev) => set({ naechsteKvNummer: Number(ev.target.value) })} />
            </Field>
            <Field label="Präfix Rezept">
              <input value={d.rezeptPraefix} onChange={(ev) => set({ rezeptPraefix: ev.target.value })} />
            </Field>
            <Field label="Nächste Rezeptnummer">
              <input type="number" min={1} value={d.naechsteRezeptNummer} onChange={(ev) => set({ naechsteRezeptNummer: Number(ev.target.value) })} />
            </Field>
          </div>
        </Card>
        <Card title="Darstellung">
          <Field label="Farbschema">
            <select value={d.theme} onChange={(ev) => set({ theme: ev.target.value as E['theme'] })}>
              <option value="auto">Automatisch (System)</option>
              <option value="hell">Hell</option>
              <option value="dunkel">Dunkel</option>
            </select>
          </Field>
        </Card>
        <div className="form-actions" style={{ marginBottom: 14 }}>
          <button className="btn primary" disabled={!e}>
            Speichern
          </button>
        </div>
      </form>

      <Card title="Praxisdaten, Preise, Adressbuch">
        <ul className="list">
          <ListLink to="/stammdaten?tab=praxis" title="Name, Adresse, IK, Bankverbindung" />
          <ListLink to="/stammdaten?tab=preise" title="Leistungen & Preise" />
          <ListLink to="/stammdaten?tab=kostentraeger" title="Kostenträger" />
          <ListLink to="/stammdaten?tab=aerzte" title="Ärzte" />
        </ul>
      </Card>

      <Card title="Sicherheit">
        <p className="small muted" style={{ marginTop: 0 }}>
          Patientendaten, Rezepte, Termine, Rechnungen und Dokumente werden auf diesem Gerät verschlüsselt gespeichert (XChaCha20-Poly1305, Schlüssel aus der PIN abgeleitet).
          Ohne PIN sind die Daten nicht lesbar – eine vergessene PIN kann nicht wiederhergestellt werden.
        </p>
        <div className="form-actions">
          <button className="btn" onClick={() => setPinSheet(true)}>
            PIN ändern
          </button>
          <button className="btn primary" onClick={sperren}>
            <Icon name="lock" size={18} /> Jetzt sperren
          </button>
        </div>
      </Card>

      <Card title="Datensicherung">
        <Alert tone="info">Alle Daten liegen nur auf diesem Gerät. Bitte regelmäßig eine Sicherung erstellen – sie wird mit einem eigenen Passwort verschlüsselt.</Alert>
        <div className="form-actions">
          <button className="btn" onClick={() => setExportSheet('sicherung')}>
            <Icon name="database" size={18} /> Sicherung erstellen
          </button>
          <label className="btn">
            Sicherung einspielen
            <input type="file" accept="application/json,.json,.mobi" hidden onChange={(ev) => ev.target.files?.[0] && dateiGewaehlt(ev.target.files[0], 'ersetzen')} />
          </label>
        </div>
      </Card>

      <Card title="Geräte-Abgleich (z. B. Smartphone ↔ PC)">
        <p className="small muted" style={{ marginTop: 0 }}>
          Ohne Server: Auf Gerät A eine Abgleich-Datei erstellen und (z. B. per AirDrop, Mail oder Cloud-Ordner) auf Gerät B übertragen, dort „Abgleich-Datei einlesen“. Pro Datensatz gewinnt die jüngste
          Änderung, Löschungen werden übernommen. Für beide Richtungen anschließend umgekehrt wiederholen.
        </p>
        {geraet && 'letzterAbgleich' in geraet && geraet.letzterAbgleich && <p className="small">Letzter Abgleich: {formatDateTime(geraet.letzterAbgleich)}</p>}
        <div className="form-actions">
          <button className="btn" onClick={() => setExportSheet('abgleich')}>
            <Icon name="repeat" size={18} /> Abgleich-Datei erstellen
          </button>
          <label className="btn primary">
            Abgleich-Datei einlesen
            <input type="file" accept="application/json,.json,.mobi" hidden onChange={(ev) => ev.target.files?.[0] && dateiGewaehlt(ev.target.files[0], 'abgleich')} />
          </label>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>Tipp: Rechnungen möglichst nur auf einem Gerät schreiben, damit keine doppelten Rechnungsnummern entstehen.</p>
      </Card>

      <PinAendernSheet open={pinSheet} onClose={() => setPinSheet(false)} />
      <ExportSheet modus={exportSheet} onClose={() => setExportSheet(null)} />
      <Sheet open={!!importDatei} onClose={() => setImportDatei(null)} title="Passwort der Datei">
        {importDatei && <PasswortAbfrage knopf={importDatei.modus === 'ersetzen' ? 'Sicherung einspielen' : 'Abgleichen'} onOk={(pw) => importAusfuehren(importDatei.text, pw, importDatei.modus)} />}
      </Sheet>
      <Sheet open={!!ergebnis} onClose={() => setErgebnis(null)} title="Abgleich abgeschlossen">
        {ergebnis && (
          <>
            <dl className="dl">
              <dt>Neu übernommen</dt>
              <dd>{ergebnis.neu}</dd>
              <dt>Aktualisiert</dt>
              <dd>{ergebnis.aktualisiert}</dd>
              <dt>Gelöscht</dt>
              <dd>{ergebnis.geloescht}</dd>
            </dl>
            {ergebnis.warnungen.map((w) => (
              <Alert key={w}>{w}</Alert>
            ))}
            <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => setErgebnis(null)}>
              OK
            </button>
          </>
        )}
      </Sheet>

      <Card title="Testbetrieb">
        <p className="small muted" style={{ marginTop: 0 }}>
          Die App enthält fiktive Beispieldaten. Diese können jederzeit neu erzeugt (Datumsangaben relativ zu heute) oder vollständig gelöscht werden.
        </p>
        <div className="form-actions">
          <button
            className="btn"
            onClick={async () => {
              if (!confirm('Alle Daten durch frische Beispieldaten ersetzen?')) return;
              await ladeBeispieldaten();
              toast('Beispieldaten geladen');
            }}
          >
            Beispieldaten neu laden
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm('Wirklich ALLE Daten unwiderruflich löschen?')) return;
              await allesLoeschen();
              await saveEinstellungen({});
              toast('Alle Daten gelöscht');
            }}
          >
            Alles löschen
          </button>
        </div>
      </Card>

      <p className="small muted" style={{ textAlign: 'center' }}>
        Mobi · Version 0.2 · <Link to="/info">Hinweise zu Datenschutz & Recht</Link>
      </p>
    </Page>
  );
}

export function applyTheme(theme: E['theme']) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  const dunkel = theme === 'dunkel' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  meta?.setAttribute('content', dunkel ? '#182027' : '#0f5c6e');
}

function PasswortAbfrage({ knopf, onOk, bestaetigen }: { knopf: string; onOk: (pw: string) => Promise<void> | void; bestaetigen?: boolean }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const ok = pw.length >= 8 && (!bestaetigen || pw === pw2);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setLaeuft(true);
        try {
          await onOk(pw);
        } finally {
          setLaeuft(false);
        }
      }}
    >
      <Field label="Passwort" hint={bestaetigen ? 'Mindestens 8 Zeichen. Ohne dieses Passwort lässt sich die Datei nicht öffnen.' : undefined}>
        <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
      </Field>
      {bestaetigen && (
        <Field label="Passwort wiederholen">
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </Field>
      )}
      <button className="btn primary block" disabled={!ok || laeuft}>
        {laeuft ? 'Bitte warten …' : knopf}
      </button>
    </form>
  );
}

function ExportSheet({ modus, onClose }: { modus: null | 'sicherung' | 'abgleich'; onClose: () => void }) {
  const toast = useToast();
  return (
    <Sheet open={!!modus} onClose={onClose} title={modus === 'abgleich' ? 'Abgleich-Datei erstellen' : 'Sicherung erstellen'}>
      <p className="small muted" style={{ marginTop: 0 }}>Die Datei wird mit diesem Passwort verschlüsselt (enthält Gesundheitsdaten).</p>
      <PasswortAbfrage
        bestaetigen
        knopf="Erstellen & teilen"
        onOk={async (pw) => {
          const inhalt = await exportiereDatei(pw);
          await dateiAusgeben(inhalt, `mobi-${modus === 'abgleich' ? 'abgleich' : 'sicherung'}-${isoDate()}.json`);
          toast('Datei erstellt');
          onClose();
        }}
      />
    </Sheet>
  );
}

function PinAendernSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [alt, setAlt] = useState('');
  const [neu, setNeu] = useState('');
  const [neu2, setNeu2] = useState('');
  const [fehler, setFehler] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title="PIN ändern">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (neu !== neu2) return setFehler('Die neuen PINs stimmen nicht überein.');
          try {
            await pinAendern(alt, neu);
            toast('PIN geändert');
            setAlt('');
            setNeu('');
            setNeu2('');
            setFehler('');
            onClose();
          } catch (err) {
            setFehler((err as Error).message);
          }
        }}
      >
        <Field label="Bisherige PIN">
          <input type="password" inputMode="numeric" autoComplete="current-password" value={alt} onChange={(e) => setAlt(e.target.value)} />
        </Field>
        <Field label={`Neue PIN (mind. ${MIN_PIN_LAENGE} Stellen)`}>
          <input type="password" inputMode="numeric" autoComplete="new-password" value={neu} onChange={(e) => setNeu(e.target.value)} />
        </Field>
        <Field label="Neue PIN wiederholen">
          <input type="password" inputMode="numeric" autoComplete="new-password" value={neu2} onChange={(e) => setNeu2(e.target.value)} />
        </Field>
        {fehler && <Alert tone="danger">{fehler}</Alert>}
        <button className="btn primary block" disabled={neu.length < MIN_PIN_LAENGE}>
          PIN ändern
        </button>
      </form>
    </Sheet>
  );
}
