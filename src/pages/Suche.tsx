import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../db/db';
import { Page } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Badge, Card, Empty, Initialen, ListLink } from '../components/ui';
import { formatDate, formatEuro, patientName } from '../lib/format';

/** Suche über Patienten, Rezepte, Rechnungen und Adressbuch (alles lokal) */
export function Suche() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const daten = useLiveQuery(async () => {
    const [patienten, rezepte, rechnungen, kts, aerzte, dokumente] = await Promise.all([
      db.patienten.toArray(),
      db.rezepte.toArray(),
      db.rechnungen.toArray(),
      db.kostentraeger.toArray(),
      db.aerzte.toArray(),
      db.dokumente.toArray(),
    ]);
    return { patienten, rezepte, rechnungen, kts, aerzte, dokumente };
  }, []);

  const s = q.trim().toLowerCase();
  const passt = (...felder: (string | undefined)[]) => felder.some((f) => f?.toLowerCase().includes(s));
  const p = daten && s.length >= 2 ? daten.patienten.filter((x) => passt(`${x.vorname} ${x.nachname}`, `${x.nachname} ${x.vorname}`, x.versicherung.versichertennummer, x.adresse.ort, x.adresse.strasse, x.telefon, x.diagnoseText)) : [];
  const r = daten && s.length >= 2 ? daten.rezepte.filter((x) => passt(x.nummer, x.diagnose, x.icd10, x.kv?.nummer, x.kv?.genehmigungsnummer)) : [];
  const re = daten && s.length >= 2 ? daten.rechnungen.filter((x) => passt(x.nummer, x.empfaenger.name, x.patientInfo.name)) : [];
  const kt = daten && s.length >= 2 ? daten.kts.filter((x) => passt(x.name, x.ik, x.adresse.ort)) : [];
  const ae = daten && s.length >= 2 ? daten.aerzte.filter((x) => passt(x.name, x.fachrichtung, x.adresse.ort, x.lanr)) : [];
  const dok = daten && s.length >= 2 ? daten.dokumente.filter((x) => passt(x.titel, x.kategorie)) : [];
  const pName = (id: string) => patientName(daten?.patienten.find((x) => x.id === id));
  const treffer = p.length + r.length + re.length + kt.length + ae.length + dok.length;

  return (
    <Page title="Suche" back>
      <div className="search">
        <Icon name="search" />
        <input
          className="input"
          type="search"
          autoFocus
          placeholder="Name, Rezept-, Rechnungs-, Versichertennummer, Diagnose …"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setParams({ q: e.target.value }, { replace: true });
          }}
          aria-label="Suchbegriff"
        />
      </div>
      {s.length < 2 && <Empty>Mindestens 2 Zeichen eingeben.</Empty>}
      {s.length >= 2 && daten && treffer === 0 && <Empty>Keine Treffer für „{q}“.</Empty>}
      {p.length > 0 && (
        <Card title={`Patienten (${p.length})`}>
          <ul className="list">
            {p.map((x) => (
              <ListLink key={x.id} to={`/patienten/${x.id}`} left={<Initialen vorname={x.vorname} nachname={x.nachname} />} title={patientName(x)} sub={`${formatDate(x.geburtsdatum)} · ${x.adresse.ort}`} />
            ))}
          </ul>
        </Card>
      )}
      {r.length > 0 && (
        <Card title={`Rezepte (${r.length})`}>
          <ul className="list">
            {r.map((x) => (
              <ListLink key={x.id} to={`/rezepte/${x.id}`} title={`${x.nummer} · ${pName(x.patientId)}`} sub={`${formatDate(x.ausstellungsdatum)} · ${x.diagnose}`} />
            ))}
          </ul>
        </Card>
      )}
      {re.length > 0 && (
        <Card title={`Rechnungen (${re.length})`}>
          <ul className="list">
            {re.map((x) => (
              <ListLink key={x.id} to={`/rechnungen/${x.id}`} title={`${x.nummer} · ${x.patientInfo.name}`} sub={`${formatDate(x.datum)} · ${x.empfaenger.name}`} right={<b>{formatEuro(x.zahlbetrag)}</b>} />
            ))}
          </ul>
        </Card>
      )}
      {dok.length > 0 && (
        <Card title={`Dokumente (${dok.length})`}>
          <ul className="list">
            {dok.map((x) => (
              <ListLink key={x.id} to={x.rezeptId ? `/rezepte/${x.rezeptId}?tab=dokumente` : `/patienten/${x.patientId}`} title={x.titel} sub={`${pName(x.patientId)} · ${formatDate(x.datum)}`} right={<Badge>{x.kategorie}</Badge>} />
            ))}
          </ul>
        </Card>
      )}
      {(kt.length > 0 || ae.length > 0) && (
        <Card title="Adressbuch">
          <ul className="list">
            {kt.map((x) => (
              <ListLink key={x.id} to="/stammdaten?tab=kostentraeger" title={x.name} sub={`Kostenträger · ${x.typ}${x.ik ? ' · IK ' + x.ik : ''}`} />
            ))}
            {ae.map((x) => (
              <ListLink key={x.id} to="/stammdaten?tab=aerzte" title={[x.titel, x.name].filter(Boolean).join(' ')} sub={`${x.fachrichtung} · ${x.adresse.ort}`} />
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}
