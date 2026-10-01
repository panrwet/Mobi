import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../db/db';
import { deleteTermin, saveTermin } from '../db/actions';
import type { Termin, TerminStatus } from '../db/types';
import { Page } from '../components/Layout';
import { SignaturePad } from '../components/SignaturePad';
import { Alert, Badge, Card, Field, useToast } from '../components/ui';
import { formatDate, formatDateTime, isoLocalDateTime, patientName } from '../lib/format';
import { useEinstellungen, useRezeptInfos } from '../lib/hooks';
import { konflikte } from '../lib/planung';
import { TERMIN_STATUS } from '../lib/status';

type TerminDaten = Omit<Termin, 'id'> & { id?: string };

export function TerminForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const e = useEinstellungen();
  const vorhanden = useLiveQuery(async () => (id ? (await db.termine.get(id)) ?? null : null), [id]);
  const infos = useRezeptInfos();
  const alleTermine = useLiveQuery(() => db.termine.toArray(), []);
  const [d, setD] = useState<TerminDaten | null>(null);
  const [unterschreiben, setUnterschreiben] = useState(false);

  if ((id && vorhanden === undefined) || !infos) return <Page title="Termin" back>…</Page>;
  if (id && vorhanden === null) return <Page title="Termin" back>Termin nicht gefunden.</Page>;

  const startParam = params.get('start');
  const startDefault = startParam ? new Date(startParam) : (() => {
    const x = new Date(Date.now() + 86400000);
    x.setHours(10, 0, 0, 0);
    return x;
  })();
  const rezeptParam = params.get('rezept') ?? '';
  const neu: TerminDaten = {
    rezeptId: rezeptParam,
    patientId: infos.find((i) => i.rezept.id === rezeptParam)?.rezept.patientId ?? '',
    start: startDefault.toISOString(),
    dauerMin: e.standardDauerMin,
    einheiten: 1,
    ort: 'Hausbesuch',
    status: 'geplant',
  };
  const data: TerminDaten = d ?? vorhanden ?? neu;
  const set = (patch: Partial<TerminDaten>) => setD({ ...data, ...patch });
  const info = infos.find((i) => i.rezept.id === data.rezeptId);
  const auswahl = infos.filter((i) => i.a.offen || i.rezept.id === data.rezeptId).sort((a, b) => patientName(a.patient).localeCompare(patientName(b.patient)));
  const kollision = konflikte(new Date(data.start), data.dauerMin, alleTermine ?? [], data.id);
  const vergangen = new Date(data.start).getTime() < Date.now();

  const doku = data.doku ?? { inhalte: '', verlauf: '', naechsteSchritte: '', erstelltAm: '' };
  const setDoku = (patch: Partial<typeof doku>) => set({ doku: { ...doku, ...patch, erstelltAm: doku.erstelltAm || new Date().toISOString() } });

  const speichern = async (status?: TerminStatus) => {
    if (!data.rezeptId) {
      alert('Bitte ein Rezept auswählen.');
      return;
    }
    const zuSpeichern = { ...data, status: status ?? data.status };
    if (zuSpeichern.status === 'durchgefuehrt' && !zuSpeichern.doku?.inhalte.trim()) {
      if (!confirm('Termin ohne Dokumentation als durchgeführt speichern? (Doku kann später ergänzt werden)')) return;
    }
    const tid = await saveTermin(zuSpeichern);
    toast('Termin gespeichert');
    if (!id) nav(`/termine/${tid}`, { replace: true });
    else setD(null);
  };

  const loeschen = async () => {
    if (!data.id || !confirm('Termin löschen?')) return;
    await deleteTermin(data.id);
    nav(-1);
  };

  const vorlage = () => {
    const letzte = (alleTermine ?? [])
      .filter((t) => t.rezeptId === data.rezeptId && t.id !== data.id && t.doku?.naechsteSchritte && t.start < data.start)
      .sort((a, b) => b.start.localeCompare(a.start))[0];
    if (letzte?.doku) setDoku({ inhalte: doku.inhalte || `Fortsetzung: ${letzte.doku.naechsteSchritte}` });
  };

  return (
    <Page title={id ? 'Termin' : 'Neuer Termin'} back>
      {info && (
        <Card>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <Link to={`/patienten/${info.rezept.patientId}`} style={{ fontWeight: 700 }}>
                {patientName(info.patient, 'vn')}
              </Link>
              <div className="muted small">
                <Link to={`/rezepte/${info.rezept.id}?tab=termine`}>{info.rezept.nummer}</Link> · {info.a.geleistetEinheiten}/{info.a.zielEinheiten} UE geleistet
              </div>
              {info.patient?.notizen && <div className="small" style={{ marginTop: 4 }}>ℹ {info.patient.notizen}</div>}
            </div>
            {id && <Badge tone={TERMIN_STATUS[data.status].tone}>{TERMIN_STATUS[data.status].label}</Badge>}
          </div>
          {info.patient?.telefon && (
            <a className="btn small" style={{ marginTop: 8 }} href={`tel:${info.patient.telefon.replace(/\s/g, '')}`}>
              Anrufen
            </a>
          )}
        </Card>
      )}

      {id && data.status === 'geplant' && vergangen && <Alert>Dieser Termin liegt in der Vergangenheit – bitte Status setzen.</Alert>}

      {id && data.status === 'geplant' && (
        <div className="row wrap" style={{ marginBottom: 14 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={() => speichern('durchgefuehrt')}>
            ✓ Durchgeführt
          </button>
          <button className="btn" onClick={() => speichern('abgesagt_patient')}>
            Abgesagt
          </button>
          <button className="btn danger" onClick={() => speichern('ausgefallen')}>
            Ausgefallen
          </button>
        </div>
      )}

      {id && (data.status === 'durchgefuehrt' || vergangen) && (
        <Card title="Dokumentation" action={data.status === 'durchgefuehrt' && !doku.inhalte.trim() ? <Badge tone="warn">fehlt</Badge> : undefined}>
          <Field label="Inhalte der Einheit *">
            <textarea rows={4} value={doku.inhalte} onChange={(ev) => setDoku({ inhalte: ev.target.value })} placeholder="z. B. Pendeltechnik, Bordsteinkanten, Route Wohnung – Haltestelle" />
          </Field>
          <Field label="Verlauf / Beobachtungen">
            <textarea rows={3} value={doku.verlauf} onChange={(ev) => setDoku({ verlauf: ev.target.value })} />
          </Field>
          <Field label="Nächste Schritte">
            <textarea rows={2} value={doku.naechsteSchritte} onChange={(ev) => setDoku({ naechsteSchritte: ev.target.value })} />
          </Field>
          <div className="row wrap">
            <button type="button" className="btn small" onClick={vorlage}>
              Aus letzter Einheit übernehmen
            </button>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Unterschrift Patient/in (Leistungsnachweis)</div>
            {unterschreiben ? (
              <SignaturePad
                onCancel={() => setUnterschreiben(false)}
                onSave={(u) => {
                  set({ unterschrift: u });
                  setUnterschreiben(false);
                }}
              />
            ) : data.unterschrift ? (
              <div className="row">
                <img src={data.unterschrift} alt="Unterschrift" className="sig-img" />
                <button className="btn small" onClick={() => set({ unterschrift: undefined })}>
                  Entfernen
                </button>
              </div>
            ) : (
              <button className="btn small" onClick={() => setUnterschreiben(true)}>
                ✍ Unterschreiben lassen
              </button>
            )}
          </div>
        </Card>
      )}

      <Card title="Termindaten">
        <Field label="Rezept / Patient *">
          <select
            value={data.rezeptId}
            onChange={(ev) => {
              const r = infos.find((i) => i.rezept.id === ev.target.value);
              set({ rezeptId: ev.target.value, patientId: r?.rezept.patientId ?? '' });
            }}
            disabled={!!id}
          >
            <option value="">– bitte wählen –</option>
            {auswahl.map((i) => (
              <option key={i.rezept.id} value={i.rezept.id}>
                {patientName(i.patient)} – {i.rezept.nummer} ({i.a.label})
              </option>
            ))}
          </select>
        </Field>
        <div className="grid2">
          <Field label="Beginn">
            <input type="datetime-local" value={isoLocalDateTime(new Date(data.start))} onChange={(ev) => ev.target.value && set({ start: new Date(ev.target.value).toISOString() })} />
          </Field>
          <Field label="Dauer (Min.)">
            <input type="number" min={15} step={15} value={data.dauerMin} onChange={(ev) => set({ dauerMin: Number(ev.target.value) })} />
          </Field>
          <Field label="Einheiten (abrechenbar)">
            <input type="number" min={0} step={0.5} value={data.einheiten} onChange={(ev) => set({ einheiten: Number(ev.target.value) })} />
          </Field>
          <Field label="Fahrtstrecke (km)">
            <input type="number" min={0} value={data.km ?? 0} onChange={(ev) => set({ km: Number(ev.target.value) })} />
          </Field>
        </div>
        <Field label="Ort / Treffpunkt">
          <input value={data.ort} onChange={(ev) => set({ ort: ev.target.value })} list="orte" />
          <datalist id="orte">
            <option value="Hausbesuch" />
            <option value="Innenstadt" />
            <option value="Hauptbahnhof" />
            <option value="Schulweg" />
            <option value="Arbeitsweg" />
          </datalist>
        </Field>
        {id && (
          <Field label="Status">
            <select value={data.status} onChange={(ev) => set({ status: ev.target.value as TerminStatus })}>
              {Object.entries(TERMIN_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Notiz">
          <input value={data.notiz ?? ''} onChange={(ev) => set({ notiz: ev.target.value })} />
        </Field>
        {kollision.length > 0 && (
          <Alert tone="danger">
            Überschneidung mit {kollision.length} Termin(en): {kollision.map((k) => formatDateTime(k.start)).join(', ')}
          </Alert>
        )}
        {info?.rezept.kv?.status !== 'genehmigt' && info?.rezept.kv?.status !== 'teilgenehmigt' && info && (
          <Alert tone="info">Hinweis: Der Kostenvoranschlag ist noch nicht genehmigt (Rezept vom {formatDate(info.rezept.ausstellungsdatum)}).</Alert>
        )}
      </Card>

      <div className="form-actions">
        {id && (
          <button className="btn danger" onClick={loeschen}>
            Löschen
          </button>
        )}
        <span className="spacer" />
        <button className="btn primary" onClick={() => speichern()}>
          Speichern
        </button>
      </div>
    </Page>
  );
}
