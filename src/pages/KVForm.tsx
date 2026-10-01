import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db';
import { getEinstellungen, saveKV } from '../db/actions';
import type { Kostenvoranschlag, Leistung, Position } from '../db/types';
import { Page } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Alert, Card, Field, useToast } from '../components/ui';
import { positionBetrag, summePositionen } from '../lib/abrechnung';
import { formatEuro, isoDate } from '../lib/format';
import { useEinstellungen } from '../lib/hooks';
import { pdf } from '../lib/pdfLazy';

const ausLeistung = (l: Leistung, menge: number): Position => ({
  leistungId: l.id,
  typ: l.typ,
  zeitpunkt: l.zeitpunkt,
  bezeichnung: l.bezeichnung,
  positionsnummer: l.positionsnummer,
  menge,
  einheit: l.einheit,
  einzelpreis: l.preis,
});

type KVDaten = Omit<Kostenvoranschlag, 'nummer'> & { nummer?: string };

export function KVForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const e = useEinstellungen();
  const r = useLiveQuery(() => db.rezepte.get(id!), [id]);
  const vorgaenger = useLiveQuery(async () => {
    if (!r?.vorgaengerId) return null;
    const v = await db.rezepte.get(r.vorgaengerId);
    if (!v) return null;
    const ts = await db.termine.where('rezeptId').equals(v.id).toArray();
    return { v, ue: ts.filter((t) => t.status === 'durchgefuehrt').reduce((s, t) => s + t.einheiten, 0) };
  }, [r?.vorgaengerId]);
  const [kv, setKv] = useState<KVDaten | null>(null);
  const [neueLeistung, setNeueLeistung] = useState('');

  if (!r || (r.vorgaengerId && vorgaenger === undefined)) return <Page title="Kostenvoranschlag" back>…</Page>;

  const vorschlag = (): KVDaten => {
    const haupt = e.leistungen.find((l) => l.typ === 'einheit' && l.leistungsart === r.leistungsart) ?? e.leistungen.find((l) => l.typ === 'einheit');
    const pos: Position[] = [];
    const erst = e.leistungen.find((l) => l.id === 'l-erst');
    const bericht = e.leistungen.find((l) => l.id === 'l-bericht');
    if (erst && !vorgaenger) pos.push(ausLeistung(erst, 1));
    if (haupt) pos.push(ausLeistung(haupt, r.verordneteEinheiten));
    if (bericht) pos.push(ausLeistung(bericht, 1));
    return {
      datum: isoDate(),
      positionen: pos,
      begruendung: vorgaenger
        ? `Folgeantrag zu ${vorgaenger.v.nummer} (KV ${vorgaenger.v.kv?.nummer ?? '–'}): Im bisherigen Training wurden ${vorgaenger.ue} Einheiten geleistet. Die Trainingsziele sind noch nicht vollständig erreicht; zur Sicherung des Trainingserfolgs ist eine Fortsetzung erforderlich. Ein Verlaufsbericht liegt bei.`
        : 'Aufgrund der Sehbehinderung ist eine sichere und selbstständige Fortbewegung ohne ein Training im Gebrauch des Blindenlangstocks nicht möglich. Das Training ist für die Nutzung des Hilfsmittels erforderlich (§ 33 Abs. 1 SGB V).',
      ziele: 'Sichere Anwendung der Langstocktechniken, selbstständiges Bewältigen alltagsrelevanter Wege, sichere Straßenquerung und Nutzung des ÖPNV.',
      status: 'entwurf',
    };
  };

  const data: KVDaten = kv ?? r.kv ?? vorschlag();
  const set = (patch: Partial<KVDaten>) => setKv({ ...data, ...patch });
  const setPos = (i: number, patch: Partial<Position>) => set({ positionen: data.positionen.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const removePos = (i: number) => set({ positionen: data.positionen.filter((_, j) => j !== i) });
  const addPos = () => {
    const l = e.leistungen.find((x) => x.id === neueLeistung);
    if (!l) return;
    set({ positionen: [...data.positionen, ausLeistung(l, l.typ === 'einheit' ? r.verordneteEinheiten : 1)] });
    setNeueLeistung('');
  };

  const speichern = async (mitPdf: boolean) => {
    await saveKV(r.id, data);
    toast('Kostenvoranschlag gespeichert');
    if (mitPdf) {
      const [neu, p, einst] = await Promise.all([db.rezepte.get(r.id), db.patienten.get(r.patientId), getEinstellungen()]);
      const kt = neu?.kostentraegerId ? await db.kostentraeger.get(neu.kostentraegerId) : undefined;
      const arzt = neu?.arztId ? await db.aerzte.get(neu.arztId) : undefined;
      if (neu && p) await pdf((m) => m.kvPdf(neu, p, einst, kt, arzt), `${neu.kv?.nummer}.pdf`);
    }
    nav(`/rezepte/${r.id}?tab=kv`, { replace: true });
  };

  return (
    <Page title={r.kv ? `KV ${r.kv.nummer}` : 'Neuer Kostenvoranschlag'} back>
      {r.kv && r.kv.status !== 'entwurf' && <Alert tone="info">Dieser KV wurde bereits versendet. Änderungen ggf. als neuen KV an den Kostenträger senden.</Alert>}
      <Card title="Positionen">
        {data.positionen.map((p, i) => (
          <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 10 }}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <Field label={`Position ${i + 1}${p.positionsnummer ? ' · ' + p.positionsnummer : ''}`}>
                  <input value={p.bezeichnung} onChange={(ev) => setPos(i, { bezeichnung: ev.target.value })} />
                </Field>
              </div>
              <button className="icon-btn" style={{ marginTop: 20 }} aria-label="Position entfernen" onClick={() => removePos(i)}>
                <Icon name="trash" size={20} />
              </button>
            </div>
            <div className="row">
              <Field label={`Menge (${p.einheit})`}>
                <input type="number" min={0} step="any" value={p.menge} onChange={(ev) => setPos(i, { menge: Number(ev.target.value) })} />
              </Field>
              <Field label="Einzelpreis €">
                <input type="number" min={0} step="0.01" value={p.einzelpreis} onChange={(ev) => setPos(i, { einzelpreis: Number(ev.target.value) })} />
              </Field>
              <div style={{ minWidth: 90, textAlign: 'right', fontWeight: 700, paddingTop: 10 }}>{formatEuro(positionBetrag(p))}</div>
            </div>
          </div>
        ))}
        <div className="row">
          <select className="input" value={neueLeistung} onChange={(ev) => setNeueLeistung(ev.target.value)} aria-label="Leistung hinzufügen">
            <option value="">+ Leistung hinzufügen …</option>
            {e.leistungen.map((l) => (
              <option key={l.id} value={l.id}>
                {l.bezeichnung} ({formatEuro(l.preis)}/{l.einheit})
              </option>
            ))}
          </select>
          <button className="btn" disabled={!neueLeistung} onClick={addPos}>
            Hinzufügen
          </button>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, fontSize: '1.1rem', fontWeight: 750 }}>
          <span>Gesamtbetrag</span>
          <span>{formatEuro(summePositionen(data.positionen))}</span>
        </div>
      </Card>

      <Card title="Angaben">
        <Field label="Datum">
          <input type="date" value={data.datum} onChange={(ev) => set({ datum: ev.target.value })} />
        </Field>
        <Field label="Begründung / Notwendigkeit">
          <textarea rows={5} value={data.begruendung} onChange={(ev) => set({ begruendung: ev.target.value })} />
        </Field>
        <Field label="Trainingsziele">
          <textarea rows={4} value={data.ziele} onChange={(ev) => set({ ziele: ev.target.value })} />
        </Field>
      </Card>

      <div className="form-actions">
        <button className="btn" onClick={() => nav(-1)}>
          Abbrechen
        </button>
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
