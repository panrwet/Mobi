import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '../db/db';
import { rechnungBezahlt, rechnungMahnen, rechnungOffen, rechnungStornieren } from '../db/actions';
import type { Rechnung } from '../db/types';
import { Page } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Alert, Badge, Card, Empty, Field, ListLink, Sheet, useToast } from '../components/ui';
import { daysBetween, formatDate, formatEuro, isoDate, parseDate } from '../lib/format';
import { useEinstellungen } from '../lib/hooks';
import { pdf as zeigePdf } from '../lib/pdfLazy';
import { PositionenTabelle } from './RezeptDetail';

type Filter = 'offen' | 'ueberfaellig' | 'bezahlt' | 'storniert' | 'alle';

const istUeberfaellig = (r: Rechnung) => r.status === 'offen' && r.faelligAm < isoDate();

function statusBadge(r: Rechnung) {
  if (r.status === 'bezahlt') return <Badge tone="ok">bezahlt</Badge>;
  if (r.status === 'storniert') return <Badge tone="neutral">storniert</Badge>;
  if (istUeberfaellig(r)) return <Badge tone="danger">überfällig</Badge>;
  return <Badge tone="warn">offen</Badge>;
}

export function RechnungenListe() {
  const [filter, setFilter] = useState<Filter>('offen');
  const alle = useLiveQuery(() => db.rechnungen.toArray(), []);
  const liste = (alle ?? [])
    .filter((r) => {
      if (filter === 'alle') return true;
      if (filter === 'ueberfaellig') return istUeberfaellig(r);
      return r.status === filter;
    })
    .sort((a, b) => b.datum.localeCompare(a.datum) || b.nummer.localeCompare(a.nummer));

  const offen = (alle ?? []).filter((r) => r.status === 'offen');
  const jahr = String(new Date().getFullYear());
  const bezahltJahr = (alle ?? []).filter((r) => r.status === 'bezahlt' && r.bezahltAm?.startsWith(jahr));

  const filter_: [Filter, string, number][] = [
    ['offen', 'Offen', offen.length],
    ['ueberfaellig', 'Überfällig', offen.filter(istUeberfaellig).length],
    ['bezahlt', 'Bezahlt', (alle ?? []).filter((r) => r.status === 'bezahlt').length],
    ['storniert', 'Storniert', (alle ?? []).filter((r) => r.status === 'storniert').length],
    ['alle', 'Alle', (alle ?? []).length],
  ];

  return (
    <Page title="Rechnungen">
      <div className="kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="kpi">
          <div className="v">{formatEuro(offen.reduce((s, r) => s + r.zahlbetrag, 0))}</div>
          <div className="l">offen ({offen.length})</div>
        </div>
        <div className="kpi">
          <div className="v">{formatEuro(bezahltJahr.reduce((s, r) => s + r.zahlbetrag, 0))}</div>
          <div className="l">Zahlungseingang {jahr}</div>
        </div>
      </div>
      <div className="chips">
        {filter_.map(([f, l, n]) => (
          <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {l} ({n})
          </button>
        ))}
      </div>
      <Card>
        {alle && liste.length === 0 && <Empty>Keine Rechnungen in dieser Ansicht.</Empty>}
        <ul className="list">
          {liste.map((r) => (
            <ListLink
              key={r.id}
              to={`/rechnungen/${r.id}`}
              title={`${r.nummer} · ${r.patientInfo.name}`}
              sub={`${r.art === 'teil' ? 'Teilrechnung · ' : ''}${formatDate(r.datum)} · ${r.empfaenger.name}`}
              right={
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>{formatEuro(r.zahlbetrag)}</div>
                  {statusBadge(r)}
                </div>
              }
            />
          ))}
        </ul>
      </Card>
      <div className="form-actions" style={{ marginBottom: 10 }}>
        <Link className="btn small" to="/statistik">
          <Icon name="chart" size={16} /> Statistik & CSV-Export
        </Link>
      </div>
      <p className="small muted" style={{ padding: '0 4px' }}>
        Neue Rechnungen werden direkt am Rezept erstellt (Status „Abrechenbar“). Rechnungen sind nach der Erstellung unveränderlich und können nur storniert werden.
      </p>
    </Page>
  );
}

export function RechnungDetail() {
  const { id } = useParams();
  const toast = useToast();
  const e = useEinstellungen();
  const re = useLiveQuery(() => db.rechnungen.get(id!), [id]);
  const rezept = useLiveQuery(async () => (re ? db.rezepte.get(re.rezeptId) : undefined), [re?.rezeptId]);
  const arzt = useLiveQuery(async () => (rezept?.arztId ? db.aerzte.get(rezept.arztId) : undefined), [rezept?.arztId]);
  const [zahlung, setZahlung] = useState(false);
  const [zahlDatum, setZahlDatum] = useState(isoDate());

  if (!re) return <Page title="Rechnung" back>…</Page>;
  const ueberfaellig = istUeberfaellig(re);
  const tage = daysBetween(parseDate(re.faelligAm)!, new Date());

  const pdf = () => zeigePdf((m) => m.rechnungPdf(re, e, rezept, arzt), `${re.nummer}.pdf`);
  const stornieren = async () => {
    const grund = prompt('Rechnung stornieren – Grund:');
    if (grund === null) return;
    await rechnungStornieren(re.id, grund);
    toast('Rechnung storniert – die Termine sind wieder abrechenbar');
  };

  return (
    <Page title={`Rechnung ${re.nummer}`} back>
      {ueberfaellig && (
        <Alert tone="danger">
          Seit {tage} Tagen überfällig{re.mahnstufe > 0 ? ` · ${re.mahnstufe}. Erinnerung versendet` : ''}.
        </Alert>
      )}
      <Card title={re.patientInfo.name} action={statusBadge(re)}>
        <dl className="dl">
          <dt>Empfänger</dt>
          <dd>
            {re.empfaenger.name}
            {re.empfaenger.ik && <span className="muted"> · IK {re.empfaenger.ik}</span>}
          </dd>
          <dt>Rechnungsdatum</dt>
          <dd>{formatDate(re.datum)}</dd>
          <dt>Leistungszeitraum</dt>
          <dd>
            {formatDate(re.leistungszeitraum.von)} – {formatDate(re.leistungszeitraum.bis)}
          </dd>
          <dt>Fällig am</dt>
          <dd>{formatDate(re.faelligAm)}</dd>
          <dt>Art</dt>
          <dd>{re.art === 'teil' ? 'Teilrechnung' : 'Schlussrechnung'}</dd>
          {(re.mahnungen?.length ?? 0) > 0 && (
            <>
              <dt>Erinnerungen</dt>
              <dd>{re.mahnungen!.map(formatDate).join(', ')}</dd>
            </>
          )}
          {re.bezahltAm && (
            <>
              <dt>Bezahlt am</dt>
              <dd>{formatDate(re.bezahltAm)}</dd>
            </>
          )}
          {re.genehmigungsnummer && (
            <>
              <dt>Genehmigung</dt>
              <dd>{re.genehmigungsnummer}</dd>
            </>
          )}
          <dt>Rezept</dt>
          <dd>{rezept ? <Link to={`/rezepte/${rezept.id}`}>{rezept.nummer}</Link> : '–'}</dd>
          {re.status === 'storniert' && (
            <>
              <dt>Storniert</dt>
              <dd>
                {formatDate(re.storniertAm)} – {re.stornoGrund || 'ohne Angabe'}
              </dd>
            </>
          )}
        </dl>
      </Card>
      <Card title="Positionen">
        <PositionenTabelle positionen={re.positionen} />
        {re.zuzahlung > 0 && (
          <div className="small" style={{ marginTop: 8 }}>
            abzgl. Zuzahlung {formatEuro(re.zuzahlung)} → <b>Zahlbetrag {formatEuro(re.zahlbetrag)}</b>
          </div>
        )}
      </Card>
      <div className="form-actions">
        <button className="btn" onClick={pdf}>
          <Icon name="pdf" size={18} /> PDF
        </button>
        {re.status === 'offen' && ueberfaellig && (
          <button
            className="btn"
            onClick={async () => {
              await rechnungMahnen(re.id);
              const neu = await db.rechnungen.get(re.id);
              if (neu) await zeigePdf((m) => m.mahnungPdf(neu, e), `Zahlungserinnerung-${re.nummer}.pdf`);
              toast('Zahlungserinnerung erstellt');
            }}
          >
            <Icon name="pdf" size={18} /> Zahlungserinnerung
          </button>
        )}
        {re.status === 'offen' && (
          <button className="btn primary" onClick={() => setZahlung(true)}>
            <Icon name="check" size={18} /> Zahlungseingang
          </button>
        )}
        {re.status === 'bezahlt' && (
          <button className="btn" onClick={() => rechnungOffen(re.id)}>
            Zahlung zurücknehmen
          </button>
        )}
        {re.status !== 'storniert' && (
          <button className="btn danger" onClick={stornieren}>
            Stornieren
          </button>
        )}
      </div>
      <Sheet open={zahlung} onClose={() => setZahlung(false)} title="Zahlungseingang erfassen">
        <Field label="Datum des Zahlungseingangs">
          <input type="date" value={zahlDatum} onChange={(ev) => setZahlDatum(ev.target.value)} />
        </Field>
        <button
          className="btn primary block"
          onClick={async () => {
            await rechnungBezahlt(re.id, zahlDatum);
            setZahlung(false);
            toast('Als bezahlt markiert – Rezept abgeschlossen');
          }}
        >
          {formatEuro(re.zahlbetrag)} als bezahlt markieren
        </button>
      </Sheet>
    </Page>
  );
}
