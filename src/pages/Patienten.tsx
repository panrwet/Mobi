import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db, newId } from '../db/db';
import { Dokumente } from '../components/Dokumente';
import type { Patient, Sehstatus } from '../db/types';
import { Page } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Alert, Badge, Card, Empty, Fab, Field, Initialen, ListLink, useToast } from '../components/ui';
import { alter, formatDate, formatDateTime, isoDate, patientName } from '../lib/format';
import { useRezeptInfos } from '../lib/hooks';
import { TERMIN_STATUS } from '../lib/status';

export function PatientenListe() {
  const [q, setQ] = useState('');
  const [archiv, setArchiv] = useState(false);
  const patienten = useLiveQuery(() => db.patienten.toArray().then((ps) => ps.sort((a, b) => a.nachname.localeCompare(b.nachname, 'de') || a.vorname.localeCompare(b.vorname, 'de'))), []);
  const infos = useRezeptInfos();
  const kts = useLiveQuery(() => db.kostentraeger.toArray(), []);
  const ktName = (id: string) => kts?.find((k) => k.id === id)?.name ?? '';

  const s = q.trim().toLowerCase();
  const gefiltert = (patienten ?? []).filter(
    (p) =>
      !!p.archiviert === archiv &&
      (!s ||
        `${p.vorname} ${p.nachname} ${p.versicherung.versichertennummer} ${p.adresse.ort} ${p.telefon ?? ''}`.toLowerCase().includes(s)),
  );

  return (
    <Page title="Patienten">
      <div className="search">
        <Icon name="search" />
        <input className="input" type="search" placeholder="Name, Ort, Versichertennummer …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Patienten suchen" />
      </div>
      <div className="chips">
        <button className={`chip ${!archiv ? 'active' : ''}`} onClick={() => setArchiv(false)}>
          Aktiv
        </button>
        <button className={`chip ${archiv ? 'active' : ''}`} onClick={() => setArchiv(true)}>
          Archiviert
        </button>
      </div>
      <Card>
        {patienten && gefiltert.length === 0 && <Empty>Keine Patienten gefunden.</Empty>}
        <ul className="list">
          {gefiltert.map((p) => {
            const offen = (infos ?? []).filter((i) => i.rezept.patientId === p.id && i.a.offen);
            return (
              <ListLink
                key={p.id}
                to={`/patienten/${p.id}`}
                left={<Initialen vorname={p.vorname} nachname={p.nachname} />}
                title={patientName(p)}
                sub={`${formatDate(p.geburtsdatum)} · ${ktName(p.versicherung.kostentraegerId)}`}
                right={offen.length > 0 ? <Badge tone={offen[0].a.tone}>{offen.length === 1 ? offen[0].a.label : `${offen.length} offen`}</Badge> : undefined}
              />
            );
          })}
        </ul>
      </Card>
      <Fab to="/patienten/neu" label="Neuer Patient" />
    </Page>
  );
}

export function PatientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const p = useLiveQuery(() => db.patienten.get(id!), [id]);
  const kt = useLiveQuery(async () => (p?.versicherung.kostentraegerId ? db.kostentraeger.get(p.versicherung.kostentraegerId) : undefined), [p]);
  const infos = useRezeptInfos(id);
  const termine = useLiveQuery(
    () => db.termine.where('patientId').equals(id!).filter((t) => t.start >= new Date().toISOString() && t.status === 'geplant').sortBy('start'),
    [id],
  );

  if (p === undefined) return <Page title="Patient" back>…</Page>;
  if (p === null) return <Page title="Patient" back><Empty>Nicht gefunden.</Empty></Page>;

  const archivieren = async () => {
    await db.patienten.update(p.id, { archiviert: !p.archiviert });
    toast(p.archiviert ? 'Patient reaktiviert' : 'Patient archiviert');
  };

  const sortiert = [...(infos ?? [])].sort((a, b) => b.rezept.ausstellungsdatum.localeCompare(a.rezept.ausstellungsdatum));

  return (
    <Page
      title={patientName(p, 'vn')}
      back="/patienten"
      actions={
        <button className="icon-btn" aria-label="Bearbeiten" onClick={() => nav(`/patienten/${p.id}/bearbeiten`)}>
          <Icon name="edit" />
        </button>
      }
    >
      {p.archiviert && <Alert tone="info">Dieser Patient ist archiviert.</Alert>}
      {!p.datenschutzEinwilligung && <Alert>Datenschutz-Einwilligung fehlt.</Alert>}
      {!p.schweigepflichtentbindung && <Alert>Schweigepflichtentbindung fehlt (für Berichte an Arzt/Kostenträger).</Alert>}

      <div className="row wrap" style={{ marginBottom: 14 }}>
        {p.telefon && (
          <a className="btn small" href={`tel:${p.telefon.replace(/\s/g, '')}`}>
            <Icon name="phone" size={18} /> Anrufen
          </a>
        )}
        <a className="btn small" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${p.adresse.strasse}, ${p.adresse.plz} ${p.adresse.ort}`)}`}>
          <Icon name="map" size={18} /> Karte
        </a>
        <Link className="btn small primary" to={`/rezepte/neu?patient=${p.id}`}>
          + Rezept
        </Link>
      </div>

      <Card title="Rezepte">
        {infos && sortiert.length === 0 && <Empty>Noch keine Rezepte.</Empty>}
        <ul className="list">
          {sortiert.map(({ rezept, a }) => (
            <ListLink
              key={rezept.id}
              to={`/rezepte/${rezept.id}`}
              title={`${rezept.nummer} · ${rezept.leistungsart}`}
              sub={`vom ${formatDate(rezept.ausstellungsdatum)} · ${a.geleistetEinheiten}/${a.zielEinheiten} UE`}
              right={<Badge tone={a.tone}>{a.label}</Badge>}
            />
          ))}
        </ul>
      </Card>

      {termine && termine.length > 0 && (
        <Card title="Nächste Termine">
          <ul className="list">
            {termine.slice(0, 5).map((t) => (
              <ListLink key={t.id} to={`/termine/${t.id}`} title={formatDateTime(t.start)} sub={t.ort} right={<Badge tone={TERMIN_STATUS[t.status].tone}>{TERMIN_STATUS[t.status].label}</Badge>} />
            ))}
          </ul>
        </Card>
      )}

      <Dokumente patientId={p.id} />

      <Card title="Stammdaten">
        <dl className="dl">
          <dt>Name</dt>
          <dd>{[p.anrede, p.vorname, p.nachname].filter(Boolean).join(' ')}</dd>
          <dt>Geburtsdatum</dt>
          <dd>
            {formatDate(p.geburtsdatum)} ({alter(p.geburtsdatum)} J.)
          </dd>
          <dt>Adresse</dt>
          <dd>
            {p.adresse.strasse}, {p.adresse.plz} {p.adresse.ort}
          </dd>
          <dt>Telefon</dt>
          <dd>{p.telefon || '–'}</dd>
          <dt>E-Mail</dt>
          <dd>{p.email || '–'}</dd>
          <dt>Notfallkontakt</dt>
          <dd>{p.notfallkontakt || '–'}</dd>
        </dl>
      </Card>

      <Card title="Versicherung (Kostenträger)">
        <dl className="dl">
          <dt>Kostenträger</dt>
          <dd>{kt ? <Link to={`/stammdaten?tab=kostentraeger`}>{kt.name}</Link> : '–'}</dd>
          <dt>Art</dt>
          <dd>{kt?.typ ?? '–'}</dd>
          <dt>IK Kostenträger</dt>
          <dd>{kt?.ik || '–'}</dd>
          <dt>Versichertennr.</dt>
          <dd>{p.versicherung.versichertennummer || '–'}</dd>
          <dt>Status</dt>
          <dd>{p.versicherung.status || '–'}</dd>
          <dt>Zuzahlung</dt>
          <dd>{p.versicherung.zuzahlungsbefreit ? `befreit${p.versicherung.befreitBis ? ' bis ' + formatDate(p.versicherung.befreitBis) : ''}` : 'nicht befreit'}</dd>
        </dl>
      </Card>

      <Card title="Sehbehinderung & Teilhabe">
        <dl className="dl">
          <dt>Status</dt>
          <dd>{p.sehstatus}</dd>
          <dt>Diagnose</dt>
          <dd>{p.diagnoseText || '–'}</dd>
          <dt>Visus</dt>
          <dd>{p.visus || '–'}</dd>
          <dt>GdB / Merkzeichen</dt>
          <dd>
            {p.gdb ?? '–'} {p.merkzeichen ? `· ${p.merkzeichen}` : ''}
          </dd>
          <dt>Hilfsmittel</dt>
          <dd>{p.hilfsmittel || '–'}</dd>
          <dt>Notizen</dt>
          <dd style={{ whiteSpace: 'pre-wrap' }}>{p.notizen || '–'}</dd>
        </dl>
      </Card>

      <Card title="Einwilligungen">
        <dl className="dl">
          <dt>Datenschutz</dt>
          <dd>{p.datenschutzEinwilligung ? <Badge tone="ok">✓ {formatDate(p.datenschutzEinwilligung)}</Badge> : <Badge tone="warn">fehlt</Badge>}</dd>
          <dt>Schweigepflicht-entbindung</dt>
          <dd>{p.schweigepflichtentbindung ? <Badge tone="ok">✓ {formatDate(p.schweigepflichtentbindung)}</Badge> : <Badge tone="warn">fehlt</Badge>}</dd>
        </dl>
      </Card>

      <button className="btn block" onClick={archivieren}>
        {p.archiviert ? 'Reaktivieren' : 'Archivieren'}
      </button>
    </Page>
  );
}

const leer = (): Patient => ({
  id: newId(),
  anrede: '',
  vorname: '',
  nachname: '',
  geburtsdatum: '',
  adresse: { strasse: '', plz: '', ort: '' },
  sehstatus: 'blind',
  versicherung: { kostentraegerId: '', versichertennummer: '', status: 'Mitglied', zuzahlungsbefreit: false },
  erstelltAm: new Date().toISOString(),
});

export function PatientForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const vorhanden = useLiveQuery(async () => (id ? (await db.patienten.get(id)) ?? null : null), [id]);
  const kts = useLiveQuery(() => db.kostentraeger.orderBy('name').toArray(), []);
  const [p, setP] = useState<Patient | null>(null);

  if (id && vorhanden === undefined) return <Page title="Patient" back>…</Page>;
  const data = p ?? vorhanden ?? leer();
  const set = (patch: Partial<Patient>) => setP({ ...data, ...patch });
  const setAdr = (patch: Partial<Patient['adresse']>) => set({ adresse: { ...data.adresse, ...patch } });
  const setVers = (patch: Partial<Patient['versicherung']>) => set({ versicherung: { ...data.versicherung, ...patch } });

  const speichern = async (e: FormEvent) => {
    e.preventDefault();
    await db.patienten.put(data);
    toast('Gespeichert');
    nav(`/patienten/${data.id}`, { replace: true });
  };

  const loeschen = async () => {
    const anzahl = await db.rezepte.where('patientId').equals(data.id).count();
    if (anzahl > 0) {
      alert('Patient hat Rezepte und kann nicht gelöscht werden. Bitte stattdessen archivieren (Aufbewahrungsfristen beachten).');
      return;
    }
    if (!confirm('Patient endgültig löschen?')) return;
    await db.patienten.delete(data.id);
    nav('/patienten', { replace: true });
  };

  return (
    <Page title={id ? 'Patient bearbeiten' : 'Neuer Patient'} back>
      <form onSubmit={speichern}>
        <Card title="Stammdaten">
          <div className="grid2">
            <Field label="Anrede">
              <select value={data.anrede} onChange={(e) => set({ anrede: e.target.value as Patient['anrede'] })}>
                <option value="">–</option>
                <option>Frau</option>
                <option>Herr</option>
                <option>Divers</option>
              </select>
            </Field>
            <Field label="Geburtsdatum *">
              <input type="date" required value={data.geburtsdatum} onChange={(e) => set({ geburtsdatum: e.target.value })} />
            </Field>
            <Field label="Vorname *">
              <input required value={data.vorname} onChange={(e) => set({ vorname: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Nachname *">
              <input required value={data.nachname} onChange={(e) => set({ nachname: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Straße, Nr.">
              <input value={data.adresse.strasse} onChange={(e) => setAdr({ strasse: e.target.value })} />
            </Field>
            <div className="row">
              <Field label="PLZ">
                <input inputMode="numeric" value={data.adresse.plz} onChange={(e) => setAdr({ plz: e.target.value })} style={{ width: 100 }} />
              </Field>
              <div style={{ flex: 1 }}>
                <Field label="Ort">
                  <input value={data.adresse.ort} onChange={(e) => setAdr({ ort: e.target.value })} />
                </Field>
              </div>
            </div>
            <Field label="Telefon">
              <input type="tel" value={data.telefon ?? ''} onChange={(e) => set({ telefon: e.target.value })} />
            </Field>
            <Field label="E-Mail">
              <input type="email" value={data.email ?? ''} onChange={(e) => set({ email: e.target.value })} />
            </Field>
          </div>
          <Field label="Notfallkontakt / Angehörige">
            <input value={data.notfallkontakt ?? ''} onChange={(e) => set({ notfallkontakt: e.target.value })} />
          </Field>
        </Card>

        <Card title="Versicherung">
          <Field label="Kostenträger">
            <select value={data.versicherung.kostentraegerId} onChange={(e) => setVers({ kostentraegerId: e.target.value })}>
              <option value="">– bitte wählen –</option>
              {kts?.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} ({k.typ})
                </option>
              ))}
            </select>
          </Field>
          <div className="grid2">
            <Field label="Versichertennummer">
              <input value={data.versicherung.versichertennummer} onChange={(e) => setVers({ versichertennummer: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Versichertenstatus">
              <select value={data.versicherung.status} onChange={(e) => setVers({ status: e.target.value as Patient['versicherung']['status'] })}>
                <option value="">–</option>
                <option>Mitglied</option>
                <option>Familienversichert</option>
                <option>Rentner</option>
              </select>
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={data.versicherung.zuzahlungsbefreit} onChange={(e) => setVers({ zuzahlungsbefreit: e.target.checked })} />
            Von der Zuzahlung befreit
          </label>
          {data.versicherung.zuzahlungsbefreit && (
            <Field label="Befreit bis">
              <input type="date" value={data.versicherung.befreitBis ?? ''} onChange={(e) => setVers({ befreitBis: e.target.value })} />
            </Field>
          )}
        </Card>

        <Card title="Sehbehinderung & Teilhabe">
          <div className="grid2">
            <Field label="Status">
              <select value={data.sehstatus} onChange={(e) => set({ sehstatus: e.target.value as Sehstatus })}>
                <option>blind</option>
                <option>hochgradig sehbehindert</option>
                <option>sehbehindert</option>
                <option>sonstige</option>
              </select>
            </Field>
            <Field label="Visus">
              <input value={data.visus ?? ''} onChange={(e) => set({ visus: e.target.value })} placeholder="z. B. RA 0,02 / LA 0,05" />
            </Field>
            <Field label="GdB">
              <input type="number" min={0} max={100} step={10} value={data.gdb ?? ''} onChange={(e) => set({ gdb: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Merkzeichen">
              <input value={data.merkzeichen ?? ''} onChange={(e) => set({ merkzeichen: e.target.value })} placeholder="Bl, G, B, H …" />
            </Field>
          </div>
          <Field label="Diagnose (Augenerkrankung)">
            <input value={data.diagnoseText ?? ''} onChange={(e) => set({ diagnoseText: e.target.value })} />
          </Field>
          <Field label="Vorhandene Hilfsmittel">
            <input value={data.hilfsmittel ?? ''} onChange={(e) => set({ hilfsmittel: e.target.value })} />
          </Field>
          <Field label="Notizen">
            <textarea value={data.notizen ?? ''} onChange={(e) => set({ notizen: e.target.value })} />
          </Field>
        </Card>

        <Card title="Einwilligungen">
          <div className="grid2">
            <Field label="Datenschutz-Einwilligung am">
              <div className="row">
                <input type="date" value={data.datenschutzEinwilligung ?? ''} onChange={(e) => set({ datenschutzEinwilligung: e.target.value || undefined })} />
                <button type="button" className="btn small" onClick={() => set({ datenschutzEinwilligung: isoDate() })}>
                  Heute
                </button>
              </div>
            </Field>
            <Field label="Schweigepflichtentbindung am">
              <div className="row">
                <input type="date" value={data.schweigepflichtentbindung ?? ''} onChange={(e) => set({ schweigepflichtentbindung: e.target.value || undefined })} />
                <button type="button" className="btn small" onClick={() => set({ schweigepflichtentbindung: isoDate() })}>
                  Heute
                </button>
              </div>
            </Field>
          </div>
        </Card>

        <div className="form-actions">
          {id && (
            <button type="button" className="btn danger" onClick={loeschen}>
              Löschen
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => nav(-1)}>
            Abbrechen
          </button>
          <button className="btn primary">Speichern</button>
        </div>
      </form>
    </Page>
  );
}
