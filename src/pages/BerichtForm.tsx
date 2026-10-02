import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db, newId } from '../db/db';
import { BERICHT_TITEL, deleteBericht, saveBericht } from '../db/actions';
import type { Bericht, BerichtTyp, Patient, Rezept, Termin } from '../db/types';
import { Page } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Alert, Card, Field, useToast } from '../components/ui';
import { alter, formatDate, isoDate } from '../lib/format';
import { useEinstellungen } from '../lib/hooks';
import { pdf } from '../lib/pdfLazy';

/** Textbausteine aus Patientendaten und Dokumentation */
export function berichtVorschlag(typ: BerichtTyp, r: Rezept, p: Patient, termine: Termin[]): Bericht {
  const geleistet = termine.filter((t) => t.status === 'durchgefuehrt').sort((a, b) => a.start.localeCompare(b.start));
  const einheiten = geleistet.reduce((s, t) => s + t.einheiten, 0);
  const letzte = [...geleistet].reverse().find((t) => t.doku?.verlauf);
  const anrede = p.anrede === 'Frau' ? 'Frau' : p.anrede === 'Herr' ? 'Herr' : '';
  const ausgangslage = [
    `${anrede} ${p.vorname} ${p.nachname} (${alter(p.geburtsdatum) ?? '?'} J.) ist ${p.sehstatus}.`,
    p.diagnoseText && `Diagnose: ${p.diagnoseText}.`,
    p.visus && `Visus: ${p.visus}.`,
    p.hilfsmittel && `Vorhandene Hilfsmittel: ${p.hilfsmittel}.`,
  ]
    .filter(Boolean)
    .join(' ');
  return {
    id: newId(),
    typ,
    datum: isoDate(),
    empfaenger: typ === 'eingang' ? 'arzt' : 'beide',
    ausgangslage,
    ziele: r.kv?.ziele ?? '',
    verlauf: typ === 'eingang' ? '' : verlaufText(geleistet, einheiten),
    ergebnis: typ === 'eingang' ? '' : (letzte?.doku?.verlauf ?? ''),
    empfehlung:
      typ === 'abschluss'
        ? 'Das Training ist abgeschlossen. Eine Auffrischung wird bei Wohnort- oder Arbeitsplatzwechsel empfohlen.'
        : typ === 'verlauf'
          ? 'Zur Sicherung des Trainingserfolgs wird die Fortsetzung des Trainings (Folgeverordnung über weitere Einheiten) empfohlen.'
          : `Training wie verordnet (${r.verordneteEinheiten} UE).`,
  };
}

function verlaufText(geleistet: Termin[], einheiten: number): string {
  if (geleistet.length === 0) return '';
  const kopf = `In ${einheiten} Einheiten vom ${formatDate(geleistet[0].start)} bis ${formatDate(geleistet[geleistet.length - 1].start)} wurden folgende Inhalte erarbeitet:`;
  const zeilen = geleistet.filter((t) => t.doku?.inhalte).map((t) => `- ${formatDate(t.start)}: ${t.doku!.inhalte}`);
  return [kopf, ...zeilen].join('\n');
}

export function BerichtForm() {
  const { id, bid } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const e = useEinstellungen();
  const daten = useLiveQuery(async () => {
    const r = await db.rezepte.get(id!);
    if (!r) return null;
    const [p, termine, kt, arzt] = await Promise.all([
      db.patienten.get(r.patientId),
      db.termine.where('rezeptId').equals(r.id).toArray(),
      r.kostentraegerId ? db.kostentraeger.get(r.kostentraegerId) : undefined,
      r.arztId ? db.aerzte.get(r.arztId) : undefined,
    ]);
    return { r, p, termine, kt, arzt };
  }, [id]);
  const [b, setB] = useState<Bericht | null>(null);

  if (!daten?.p) return <Page title="Bericht" back>…</Page>;
  const { r, p, termine, kt, arzt } = daten;
  const vorhanden = r.berichte?.find((x) => x.id === bid);
  const data = b ?? vorhanden ?? berichtVorschlag((params.get('typ') as BerichtTyp) || 'abschluss', r, p, termine);
  const set = (patch: Partial<Bericht>) => setB({ ...data, ...patch });

  const speichern = async (mitPdf: boolean) => {
    await saveBericht(r.id, data);
    toast('Bericht gespeichert');
    if (mitPdf) await pdf((m) => m.berichtPdf(r, p, data, termine, e, kt, arzt), `${BERICHT_TITEL[data.typ]}-${p.nachname}-${data.datum}.pdf`);
    nav(`/rezepte/${r.id}?tab=berichte`, { replace: true });
  };

  return (
    <Page title={BERICHT_TITEL[data.typ]} back>
      {!p.schweigepflichtentbindung && <Alert>Für {p.vorname} {p.nachname} ist keine Schweigepflichtentbindung hinterlegt. Berichte an Arzt/Kostenträger erst nach Entbindung versenden.</Alert>}
      <Card>
        <div className="grid2">
          <Field label="Art">
            <select value={data.typ} onChange={(ev) => set({ typ: ev.target.value as BerichtTyp })}>
              {Object.entries(BERICHT_TITEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Datum">
            <input type="date" value={data.datum} onChange={(ev) => set({ datum: ev.target.value })} />
          </Field>
          <Field label="Empfänger">
            <select value={data.empfaenger} onChange={(ev) => set({ empfaenger: ev.target.value as Bericht['empfaenger'] })}>
              <option value="arzt">Verordnender Arzt{arzt ? ` (${arzt.name})` : ''}</option>
              <option value="kostentraeger">Kostenträger{kt ? ` (${kt.name})` : ''}</option>
              <option value="beide">Kostenträger, Kopie an Arzt</option>
            </select>
          </Field>
          <Field label="Versendet am">
            <input type="date" value={data.versendetAm ?? ''} onChange={(ev) => set({ versendetAm: ev.target.value || undefined })} />
          </Field>
        </div>
      </Card>
      <Card title="Inhalt">
        <Field label="Ausgangslage / Befund">
          <textarea rows={4} value={data.ausgangslage} onChange={(ev) => set({ ausgangslage: ev.target.value })} />
        </Field>
        <Field label="Ziele">
          <textarea rows={3} value={data.ziele} onChange={(ev) => set({ ziele: ev.target.value })} />
        </Field>
        <Field label="Verlauf">
          <textarea rows={7} value={data.verlauf} onChange={(ev) => set({ verlauf: ev.target.value })} />
        </Field>
        <div className="row wrap" style={{ marginTop: -4, marginBottom: 12 }}>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              const geleistet = termine.filter((t) => t.status === 'durchgefuehrt').sort((a, c) => a.start.localeCompare(c.start));
              set({ verlauf: verlaufText(geleistet, geleistet.reduce((s, t) => s + t.einheiten, 0)) });
            }}
          >
            Verlauf aus Dokumentation übernehmen
          </button>
        </div>
        <Field label={data.typ === 'eingang' ? 'Einschätzung' : 'Ergebnis'}>
          <textarea rows={3} value={data.ergebnis} onChange={(ev) => set({ ergebnis: ev.target.value })} />
        </Field>
        <Field label="Empfehlung">
          <textarea rows={3} value={data.empfehlung} onChange={(ev) => set({ empfehlung: ev.target.value })} />
        </Field>
      </Card>
      <div className="form-actions">
        {vorhanden && (
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm('Bericht löschen?')) return;
              await deleteBericht(r.id, vorhanden.id);
              nav(`/rezepte/${r.id}?tab=berichte`, { replace: true });
            }}
          >
            Löschen
          </button>
        )}
        <span className="spacer" />
        <button className="btn" onClick={() => speichern(false)}>
          Speichern
        </button>
        <button className="btn primary" onClick={() => speichern(true)}>
          <Icon name="pdf" size={18} /> Speichern & PDF
        </button>
      </div>
    </Page>
  );
}
