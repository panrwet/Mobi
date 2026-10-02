import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import type { Rechnung } from '../db/types';
import { Page } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Card, Empty } from '../components/ui';
import { formatDate, formatEuro, isoDate, parseDate, round2 } from '../lib/format';
import { csvAusgeben } from '../lib/csv';

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

interface Balken {
  label: string;
  wert: number;
  text: string;
}

/** Einfaches Säulendiagramm (eine Reihe) mit Hover-/Fokus-Tooltip und Tabellenansicht */
function Saeulen({ titel, daten, einheit }: { titel: string; daten: Balken[]; einheit: (v: number) => string }) {
  const [aktiv, setAktiv] = useState<number | null>(null);
  const [tabelle, setTabelle] = useState(false);
  const max = Math.max(1, ...daten.map((d) => d.wert));
  const maxIndex = daten.findIndex((d) => d.wert === max);
  return (
    <Card
      title={titel}
      action={
        <button className="btn ghost small" onClick={() => setTabelle(!tabelle)}>
          {tabelle ? 'Diagramm' : 'Tabelle'}
        </button>
      }
    >
      {tabelle ? (
        <table className="tbl">
          <tbody>
            {daten.map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td className="num">{d.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="saeulen" role="img" aria-label={`${titel}: ${daten.map((d) => `${d.label} ${d.text}`).join(', ')}`}>
          <div className="saeulen-flaeche">
            {daten.map((d, i) => (
              <div
                key={d.label}
                className="saeule-spalte"
                tabIndex={0}
                onMouseEnter={() => setAktiv(i)}
                onMouseLeave={() => setAktiv(null)}
                onFocus={() => setAktiv(i)}
                onBlur={() => setAktiv(null)}
                onClick={() => setAktiv(aktiv === i ? null : i)}
              >
                {(aktiv === i || (aktiv === null && i === maxIndex && d.wert > 0)) && (
                  <div className={`saeule-tip ${aktiv === i ? 'aktiv' : ''}`} style={{ bottom: `calc(${(d.wert / max) * 100}% + 4px)` }}>
                    {aktiv === i && <span className="muted">{d.label} · </span>}
                    {einheit(d.wert)}
                  </div>
                )}
                <div className="saeule" style={{ height: `${(d.wert / max) * 100}%`, opacity: aktiv === null || aktiv === i ? 1 : 0.45 }} />
              </div>
            ))}
          </div>
          <div className="saeulen-achse">
            {daten.map((d) => (
              <span key={d.label}>{d.label}</span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export function Statistik() {
  const aktuellesJahr = new Date().getFullYear();
  const [jahr, setJahr] = useState(aktuellesJahr);
  const daten = useLiveQuery(async () => {
    const [rechnungen, termine, rezepte, kts] = await Promise.all([db.rechnungen.toArray(), db.termine.toArray(), db.rezepte.toArray(), db.kostentraeger.toArray()]);
    return { rechnungen, termine, rezepte, kts };
  }, []);

  if (!daten) return <Page title="Statistik" back>…</Page>;
  const { rechnungen, termine, rezepte, kts } = daten;
  const j = String(jahr);
  const reJahr = rechnungen.filter((r) => r.status !== 'storniert' && r.datum.startsWith(j));
  const bezahltJahr = rechnungen.filter((r) => r.status === 'bezahlt' && r.bezahltAm?.startsWith(j));
  const tJahr = termine.filter((t) => new Date(t.start).getFullYear() === jahr);
  const geleistet = tJahr.filter((t) => t.status === 'durchgefuehrt');
  const ausfall = tJahr.filter((t) => t.status === 'ausgefallen' || t.status === 'abgesagt_patient');
  const beendet = geleistet.length + ausfall.length;
  const kvAntworten = rezepte.filter((r) => r.kv?.versendetAm && r.kv.antwortAm && r.kv.antwortAm.startsWith(j));
  const kvTage = kvAntworten.length
    ? Math.round(kvAntworten.reduce((s, r) => s + (parseDate(r.kv!.antwortAm)!.getTime() - parseDate(r.kv!.versendetAm)!.getTime()) / 86400000, 0) / kvAntworten.length)
    : null;

  const proMonatUmsatz: Balken[] = MONATE.map((m, i) => {
    const v = round2(reJahr.filter((r) => parseDate(r.datum)!.getMonth() === i).reduce((s, r) => s + r.zahlbetrag, 0));
    return { label: m, wert: v, text: formatEuro(v) };
  });
  const proMonatUE: Balken[] = MONATE.map((m, i) => {
    const v = geleistet.filter((t) => new Date(t.start).getMonth() === i).reduce((s, t) => s + t.einheiten, 0);
    return { label: m, wert: v, text: `${v} UE` };
  });

  const nachKt = kts
    .map((k) => {
      const rs = reJahr.filter((r) => r.kostentraegerId === k.id);
      return { name: k.name, anzahl: rs.length, summe: rs.reduce((s, r) => s + r.zahlbetrag, 0), offen: rs.filter((r) => r.status === 'offen').reduce((s, r) => s + r.zahlbetrag, 0) };
    })
    .filter((x) => x.anzahl > 0)
    .sort((a, b) => b.summe - a.summe);

  const jahre = [...new Set([aktuellesJahr, ...rechnungen.map((r) => Number(r.datum.slice(0, 4)))])].sort((a, b) => b - a);

  const exportRechnungen = () =>
    csvAusgeben(
      `rechnungsausgangsbuch-${jahr}.csv`,
      ['Rechnungsnummer', 'Art', 'Datum', 'Empfänger', 'IK', 'Patient', 'Leistungszeitraum', 'Summe', 'Zuzahlung', 'Zahlbetrag', 'Status', 'Bezahlt am', 'Storniert am'],
      rechnungen
        .filter((r) => r.datum.startsWith(j))
        .sort((a, b) => a.nummer.localeCompare(b.nummer))
        .map((r: Rechnung) => [
          r.nummer,
          r.art === 'teil' ? 'Teilrechnung' : 'Schlussrechnung',
          formatDate(r.datum),
          r.empfaenger.name,
          r.empfaenger.ik ?? '',
          r.patientInfo.name,
          `${formatDate(r.leistungszeitraum.von)} - ${formatDate(r.leistungszeitraum.bis)}`,
          r.summe,
          r.zuzahlung,
          r.zahlbetrag,
          r.status,
          r.bezahltAm ? formatDate(r.bezahltAm) : '',
          r.storniertAm ? formatDate(r.storniertAm) : '',
        ]),
    );

  return (
    <Page title="Statistik" back>
      <div className="chips">
        {jahre.map((x) => (
          <button key={x} className={`chip ${x === jahr ? 'active' : ''}`} onClick={() => setJahr(x)}>
            {x}
          </button>
        ))}
      </div>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="kpi">
          <div className="v" style={{ fontSize: '1.05rem' }}>{formatEuro(reJahr.reduce((s, r) => s + r.zahlbetrag, 0))}</div>
          <div className="l">abgerechnet {jahr}</div>
        </div>
        <div className="kpi">
          <div className="v" style={{ fontSize: '1.05rem' }}>{formatEuro(bezahltJahr.reduce((s, r) => s + r.zahlbetrag, 0))}</div>
          <div className="l">Zahlungseingang</div>
        </div>
        <div className="kpi">
          <div className="v">{geleistet.reduce((s, t) => s + t.einheiten, 0)}</div>
          <div className="l">geleistete UE</div>
        </div>
        <div className="kpi">
          <div className="v">{beendet ? Math.round((ausfall.length / beendet) * 100) : 0} %</div>
          <div className="l">Ausfall-/Absagequote</div>
        </div>
        <div className="kpi">
          <div className="v">{kvTage ?? '–'}</div>
          <div className="l">Ø Tage bis KV-Antwort</div>
        </div>
        <div className="kpi">
          <div className="v">{new Set(geleistet.map((t) => t.patientId)).size}</div>
          <div className="l">behandelte Patienten</div>
        </div>
      </div>

      <Saeulen titel={`Abgerechnet pro Monat (${jahr})`} daten={proMonatUmsatz} einheit={formatEuro} />
      <Saeulen titel={`Geleistete Einheiten pro Monat (${jahr})`} daten={proMonatUE} einheit={(v) => `${v} UE`} />

      <Card title="Nach Kostenträger">
        {nachKt.length === 0 ? (
          <Empty>Keine Rechnungen in {jahr}.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Kostenträger</th>
                  <th className="num">Rechn.</th>
                  <th className="num">Betrag</th>
                  <th className="num">offen</th>
                </tr>
              </thead>
              <tbody>
                {nachKt.map((k) => (
                  <tr key={k.name}>
                    <td>{k.name}</td>
                    <td className="num">{k.anzahl}</td>
                    <td className="num">{formatEuro(k.summe)}</td>
                    <td className="num">{k.offen ? formatEuro(k.offen) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Export (CSV, z. B. für Steuerberatung)">
        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" onClick={exportRechnungen}>
            <Icon name="file" size={18} /> Rechnungsausgangsbuch {jahr}
          </button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>Stand {formatDate(isoDate())}. Die CSV-Datei enthält Patientennamen – bitte vertraulich behandeln.</p>
      </Card>
    </Page>
  );
}
