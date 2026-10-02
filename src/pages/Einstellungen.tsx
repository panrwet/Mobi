import { useState } from 'react';
import { Link } from 'react-router-dom';
import { allesLoeschen, saveEinstellungen } from '../db/actions';
import { brauchtPasswort, dateiAusgeben, exportiereSicherung, sicherungEinspielen } from '../db/sicherung';
import { ladeBeispieldaten } from '../db/seed';
import type { Einstellungen as E } from '../db/types';
import { Page } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Alert, Card, Field, ListLink, Sheet, useToast } from '../components/ui';
import { isoDate } from '../lib/format';
import { useEinstellungen } from '../lib/hooks';

export function Einstellungen() {
  const gespeichert = useEinstellungen();
  const toast = useToast();
  const [e, setE] = useState<E | null>(null);
  const d = e ?? gespeichert;
  const set = (p: Partial<E>) => setE({ ...d, ...p });

  const [exportOffen, setExportOffen] = useState(false);
  const [importText, setImportText] = useState<string | null>(null);

  const dateiGewaehlt = async (file: File) => {
    const text = await file.text();
    if (brauchtPasswort(text)) setImportText(text);
    else await einspielen(text, '');
  };

  const einspielen = async (text: string, passwort: string) => {
    if (!confirm('Alle aktuellen Daten werden durch die Sicherung ersetzt. Fortfahren?')) return;
    try {
      await sicherungEinspielen(text, passwort);
      setImportText(null);
      toast('Sicherung wiederhergestellt');
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

      <Card title="Datensicherung">
        <Alert tone="info">Alle Daten liegen nur auf diesem Gerät. Bitte regelmäßig eine Sicherung erstellen und sicher aufbewahren (enthält Gesundheitsdaten).</Alert>
        <div className="form-actions">
          <button className="btn" onClick={() => setExportOffen(true)}>
            <Icon name="database" size={18} /> Sicherung erstellen
          </button>
          <label className="btn">
            Sicherung einspielen
            <input type="file" accept="application/json,.json" hidden onChange={(ev) => ev.target.files?.[0] && dateiGewaehlt(ev.target.files[0])} />
          </label>
        </div>
      </Card>

      <ExportSheet open={exportOffen} onClose={() => setExportOffen(false)} />
      <Sheet open={importText !== null} onClose={() => setImportText(null)} title="Passwort der Sicherung">
        {importText !== null && <PasswortAbfrage knopf="Sicherung einspielen" onOk={(pw) => einspielen(importText, pw)} />}
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
  const ok = bestaetigen ? pw === '' || (pw.length >= 8 && pw === pw2) : pw.length > 0;
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
      <Field label={bestaetigen ? 'Passwort (optional, empfohlen)' : 'Passwort'} hint={bestaetigen ? 'Mindestens 8 Zeichen. Leer lassen für eine unverschlüsselte Sicherung. Ohne das Passwort lässt sich die Datei nicht öffnen.' : undefined}>
        <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
      </Field>
      {bestaetigen && pw && (
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

function ExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  return (
    <Sheet open={open} onClose={onClose} title="Sicherung erstellen">
      <PasswortAbfrage
        bestaetigen
        knopf="Sicherung erstellen"
        onOk={async (pw) => {
          await dateiAusgeben(await exportiereSicherung(pw), `mobi-sicherung-${isoDate()}.json`);
          toast('Sicherung erstellt');
          onClose();
        }}
      />
    </Sheet>
  );
}
