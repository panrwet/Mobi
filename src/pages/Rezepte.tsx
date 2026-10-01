import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../db/db';
import { createRezept, updateRezept } from '../db/actions';
import type { Leistungsart, Rezept } from '../db/types';
import { Page } from '../components/Layout';
import { Badge, Card, Empty, Fab, Field, ListLink, useToast } from '../components/ui';
import { formatDate, isoDate, patientName } from '../lib/format';
import { useRezeptInfos } from '../lib/hooks';
import { prioritaet, type RezeptPhase } from '../lib/status';

type Filter = 'alle' | 'offen' | 'hinweise' | RezeptPhase;

const filterOptionen: [Filter, string][] = [
  ['offen', 'Offen'],
  ['hinweise', 'Mit Hinweis'],
  ['neu', 'Neu'],
  ['kv_entwurf', 'KV in Arbeit'],
  ['kv_versendet', 'KV versendet'],
  ['genehmigt', 'Genehmigt'],
  ['termine_verplant', 'Verplant'],
  ['in_behandlung', 'In Behandlung'],
  ['doku_offen', 'Doku offen'],
  ['abrechenbar', 'Abrechenbar'],
  ['abgerechnet', 'Abgerechnet'],
  ['kv_abgelehnt', 'Abgelehnt'],
  ['abgeschlossen', 'Abgeschlossen'],
  ['storniert', 'Storniert'],
  ['alle', 'Alle'],
];

export function RezepteListe() {
  const [params, setParams] = useSearchParams();
  const filter = (params.get('filter') as Filter) || 'offen';
  const infos = useRezeptInfos();

  const zaehle = (f: Filter) => (infos ?? []).filter((i) => passt(i.a, f)).length;
  const liste = (infos ?? [])
    .filter((i) => passt(i.a, filter))
    .sort((a, b) => prioritaet(a.a) - prioritaet(b.a) || b.rezept.ausstellungsdatum.localeCompare(a.rezept.ausstellungsdatum));

  return (
    <Page title="Rezepte">
      <div className="chips" role="tablist">
        {filterOptionen.map(([f, l]) => {
          const n = zaehle(f);
          if (n === 0 && f !== filter && f !== 'alle' && f !== 'offen') return null;
          return (
            <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setParams({ filter: f }, { replace: true })}>
              {l} ({n})
            </button>
          );
        })}
      </div>
      <Card>
        {infos && liste.length === 0 && <Empty>Keine Rezepte in dieser Ansicht.</Empty>}
        <ul className="list">
          {liste.map(({ rezept, patient, a }) => (
            <ListLink
              key={rezept.id}
              to={`/rezepte/${rezept.id}`}
              title={patientName(patient)}
              sub={
                <>
                  {rezept.nummer} · {formatDate(rezept.ausstellungsdatum)} · {a.geleistetEinheiten}/{a.zielEinheiten} UE
                  {a.warnungen.length > 0 && <span style={{ color: 'var(--warn)' }}> · ⚠ {a.warnungen.length}</span>}
                </>
              }
              right={<Badge tone={a.tone}>{a.label}</Badge>}
            />
          ))}
        </ul>
      </Card>
      <Fab to="/rezepte/neu" label="Neues Rezept" />
    </Page>
  );
}

function passt(a: { phase: RezeptPhase; offen: boolean; warnungen: unknown[] }, f: Filter) {
  if (f === 'alle') return true;
  if (f === 'offen') return a.offen;
  if (f === 'hinweise') return a.offen && a.warnungen.length > 0;
  return a.phase === f;
}

type RezeptDaten = Omit<Rezept, 'id' | 'nummer' | 'verlauf' | 'erstelltAm'>;

export function RezeptForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const vorhanden = useLiveQuery(async () => (id ? (await db.rezepte.get(id)) ?? null : null), [id]);
  const patienten = useLiveQuery(() => db.patienten.filter((p) => !p.archiviert).toArray().then((ps) => ps.sort((a, b) => a.nachname.localeCompare(b.nachname, 'de') || a.vorname.localeCompare(b.vorname, 'de'))), []);
  const aerzte = useLiveQuery(() => db.aerzte.orderBy('name').toArray(), []);
  const kts = useLiveQuery(() => db.kostentraeger.orderBy('name').toArray(), []);
  const folgeId = params.get('folge');
  const vorgaenger = useLiveQuery(async () => (folgeId ? (await db.rezepte.get(folgeId)) ?? null : null), [folgeId]);
  const [d, setD] = useState<RezeptDaten | null>(null);

  if (id && vorhanden === undefined) return <Page title="Rezept" back>…</Page>;
  if (folgeId && vorgaenger === undefined) return <Page title="Rezept" back>…</Page>;

  const vorPatient = params.get('patient') ?? '';
  const folge: RezeptDaten | null = vorgaenger
    ? {
        patientId: vorgaenger.patientId,
        arztId: vorgaenger.arztId,
        kostentraegerId: vorgaenger.kostentraegerId,
        leistungsart: vorgaenger.leistungsart,
        ausstellungsdatum: isoDate(),
        eingangsdatum: isoDate(),
        diagnose: vorgaenger.diagnose,
        icd10: vorgaenger.icd10,
        verordnung: vorgaenger.verordnung.startsWith('Folgeverordnung') ? vorgaenger.verordnung : `Folgeverordnung: ${vorgaenger.verordnung}`,
        verordneteEinheiten: vorgaenger.verordneteEinheiten,
        vorgaengerId: vorgaenger.id,
      }
    : null;
  const start: RezeptDaten = vorhanden ?? folge ?? {
    patientId: vorPatient,
    arztId: '',
    kostentraegerId: patienten?.find((p) => p.id === vorPatient)?.versicherung.kostentraegerId ?? '',
    leistungsart: 'O&M',
    ausstellungsdatum: isoDate(),
    eingangsdatum: isoDate(),
    diagnose: patienten?.find((p) => p.id === vorPatient)?.diagnoseText ?? '',
    icd10: '',
    verordnung: 'Training in Orientierung und Mobilität mit dem Blindenlangstock',
    verordneteEinheiten: 20,
  };
  const data = d ?? start;
  const set = (patch: Partial<RezeptDaten>) => setD({ ...data, ...patch });

  const waehlePatient = (pid: string) => {
    const p = patienten?.find((x) => x.id === pid);
    set({ patientId: pid, kostentraegerId: p?.versicherung.kostentraegerId ?? data.kostentraegerId, diagnose: data.diagnose || p?.diagnoseText || '' });
  };

  const speichern = async (e: FormEvent) => {
    e.preventDefault();
    if (id) {
      await updateRezept(id, data);
      toast('Gespeichert');
      nav(`/rezepte/${id}`, { replace: true });
    } else {
      const neu = await createRezept(data);
      toast('Rezept angelegt');
      nav(`/rezepte/${neu}`, { replace: true });
    }
  };

  return (
    <Page title={id ? 'Rezept bearbeiten' : vorgaenger ? 'Folgeverordnung' : 'Neues Rezept'} back>
      <form onSubmit={speichern}>
        {vorgaenger && (
          <div className="alert info" role="status">
            Folgeverordnung zu {vorgaenger.nummer} vom {formatDate(vorgaenger.ausstellungsdatum)} – Daten wurden übernommen, bitte Ausstellungsdatum und Einheiten der neuen Verordnung prüfen.
          </div>
        )}
        <Card title="Verordnung">
          <Field label="Patient *">
            <select required value={data.patientId} onChange={(e) => waehlePatient(e.target.value)} disabled={!!id}>
              <option value="">– bitte wählen –</option>
              {patienten?.map((p) => (
                <option key={p.id} value={p.id}>
                  {patientName(p)} ({formatDate(p.geburtsdatum)})
                </option>
              ))}
            </select>
          </Field>
          <div className="grid2">
            <Field label="Ausstellungsdatum *">
              <input type="date" required value={data.ausstellungsdatum} onChange={(e) => set({ ausstellungsdatum: e.target.value })} />
            </Field>
            <Field label="Eingang bei mir">
              <input type="date" value={data.eingangsdatum} onChange={(e) => set({ eingangsdatum: e.target.value })} />
            </Field>
            <Field label="Verordnender Arzt">
              <select value={data.arztId} onChange={(e) => set({ arztId: e.target.value })}>
                <option value="">–</option>
                {aerzte?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {[a.titel, a.name].filter(Boolean).join(' ')} – {a.fachrichtung}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kostenträger">
              <select value={data.kostentraegerId} onChange={(e) => set({ kostentraegerId: e.target.value })}>
                <option value="">– Selbstzahler –</option>
                {kts?.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Leistungsart">
              <select value={data.leistungsart} onChange={(e) => set({ leistungsart: e.target.value as Leistungsart })}>
                <option value="O&M">Orientierung & Mobilität (O&M)</option>
                <option value="LPF">Lebenspraktische Fähigkeiten (LPF)</option>
                <option value="Sonstige">Sonstige</option>
              </select>
            </Field>
            <Field label="Verordnete Einheiten *">
              <input type="number" min={1} required value={data.verordneteEinheiten} onChange={(e) => set({ verordneteEinheiten: Number(e.target.value) })} />
            </Field>
            <Field label="Diagnose *">
              <input required value={data.diagnose} onChange={(e) => set({ diagnose: e.target.value })} />
            </Field>
            <Field label="ICD-10">
              <input value={data.icd10} onChange={(e) => set({ icd10: e.target.value.toUpperCase() })} placeholder="z. B. H54.0" />
            </Field>
          </div>
          <Field label="Verordnungstext">
            <textarea value={data.verordnung} onChange={(e) => set({ verordnung: e.target.value })} />
          </Field>
          <Field label="Notizen">
            <textarea value={data.notizen ?? ''} onChange={(e) => set({ notizen: e.target.value })} />
          </Field>
        </Card>
        <div className="form-actions">
          <button type="button" className="btn" onClick={() => nav(-1)}>
            Abbrechen
          </button>
          <button className="btn primary">{id ? 'Speichern' : 'Rezept anlegen'}</button>
        </div>
      </form>
    </Page>
  );
}

