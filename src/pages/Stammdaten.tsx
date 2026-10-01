import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db, newId } from '../db/db';
import { saveEinstellungen } from '../db/actions';
import type { Adresse, Arzt, Einstellungen, Kostentraeger, KostentraegerTyp, Leistung, Leistungsart, PositionTyp } from '../db/types';
import { Page } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Card, Empty, Field, Sheet, Tabs, useToast } from '../components/ui';
import { formatEuro, pruefeIban } from '../lib/format';
import { useEinstellungen } from '../lib/hooks';

type Tab = 'praxis' | 'preise' | 'kostentraeger' | 'aerzte';

export function Stammdaten() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'praxis';
  return (
    <Page title="Stammdaten" back>
      <Tabs
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        options={[
          ['praxis', 'Praxis & Bank'],
          ['preise', 'Leistungen'],
          ['kostentraeger', 'Kostenträger'],
          ['aerzte', 'Ärzte'],
        ]}
      />
      {tab === 'praxis' && <PraxisForm />}
      {tab === 'preise' && <Leistungen />}
      {tab === 'kostentraeger' && <KostentraegerListe />}
      {tab === 'aerzte' && <AerzteListe />}
    </Page>
  );
}

function AdressFelder({ a, onChange }: { a: Adresse; onChange: (a: Adresse) => void }) {
  return (
    <>
      <Field label="Straße, Nr.">
        <input value={a.strasse} onChange={(e) => onChange({ ...a, strasse: e.target.value })} />
      </Field>
      <div className="row">
        <Field label="PLZ">
          <input inputMode="numeric" style={{ width: 100 }} value={a.plz} onChange={(e) => onChange({ ...a, plz: e.target.value })} />
        </Field>
        <div style={{ flex: 1 }}>
          <Field label="Ort">
            <input value={a.ort} onChange={(e) => onChange({ ...a, ort: e.target.value })} />
          </Field>
        </div>
      </div>
    </>
  );
}

function PraxisForm() {
  const gespeichert = useEinstellungen();
  const toast = useToast();
  const [e, setE] = useState<Einstellungen | null>(null);
  const d = e ?? gespeichert;
  const set = (patch: Partial<Einstellungen>) => setE({ ...d, ...patch });
  const ibanOk = !d.iban || pruefeIban(d.iban);

  return (
    <form
      onSubmit={async (ev) => {
        ev.preventDefault();
        await saveEinstellungen(d);
        setE(null);
        toast('Stammdaten gespeichert');
      }}
    >
      <Card title="Reha-Fachkraft / Praxis">
        <div className="grid2">
          <Field label="Name">
            <input value={d.name} onChange={(ev) => set({ name: ev.target.value })} />
          </Field>
          <Field label="Berufsbezeichnung">
            <input value={d.berufsbezeichnung} onChange={(ev) => set({ berufsbezeichnung: ev.target.value })} />
          </Field>
        </div>
        <Field label="Praxisname (Briefkopf)">
          <input value={d.praxisname} onChange={(ev) => set({ praxisname: ev.target.value })} />
        </Field>
        <AdressFelder a={d.adresse} onChange={(adresse) => set({ adresse })} />
        <div className="grid2">
          <Field label="Telefon">
            <input value={d.telefon} onChange={(ev) => set({ telefon: ev.target.value })} />
          </Field>
          <Field label="E-Mail">
            <input type="email" value={d.email} onChange={(ev) => set({ email: ev.target.value })} />
          </Field>
          <Field label="Institutionskennzeichen (IK)" hint="9-stellig, von der ARGE IK vergeben – Pflicht für die Abrechnung mit Krankenkassen.">
            <input inputMode="numeric" maxLength={9} value={d.ik} onChange={(ev) => set({ ik: ev.target.value.replace(/\D/g, '') })} />
          </Field>
          <Field label="Steuernummer">
            <input value={d.steuernummer} onChange={(ev) => set({ steuernummer: ev.target.value })} />
          </Field>
        </div>
        <Field label="Umsatzsteuer-Hinweis auf Rechnungen" hint="Mit Steuerberater klären, ob die Leistung nach § 4 Nr. 14 UStG befreit ist.">
          <input value={d.ustHinweis} onChange={(ev) => set({ ustHinweis: ev.target.value })} />
        </Field>
      </Card>
      <Card title="Bankverbindung">
        <Field label="Kontoinhaber">
          <input value={d.kontoinhaber} onChange={(ev) => set({ kontoinhaber: ev.target.value })} />
        </Field>
        <Field label="IBAN" hint={ibanOk ? undefined : '⚠ IBAN-Prüfsumme ungültig'}>
          <input value={d.iban} onChange={(ev) => set({ iban: ev.target.value.toUpperCase().replace(/\s/g, '') })} />
        </Field>
        <div className="grid2">
          <Field label="BIC">
            <input value={d.bic} onChange={(ev) => set({ bic: ev.target.value.toUpperCase() })} />
          </Field>
          <Field label="Bank">
            <input value={d.bank} onChange={(ev) => set({ bank: ev.target.value })} />
          </Field>
        </div>
      </Card>
      <div className="form-actions">
        {e && (
          <button type="button" className="btn" onClick={() => setE(null)}>
            Verwerfen
          </button>
        )}
        <button className="btn primary" disabled={!e}>
          Speichern
        </button>
      </div>
    </form>
  );
}

function Leistungen() {
  const e = useEinstellungen();
  const toast = useToast();
  const [bearbeiten, setBearbeiten] = useState<Leistung | null>(null);

  const speichern = async (l: Leistung) => {
    const vorhanden = e.leistungen.some((x) => x.id === l.id);
    await saveEinstellungen({ leistungen: vorhanden ? e.leistungen.map((x) => (x.id === l.id ? l : x)) : [...e.leistungen, l] });
    setBearbeiten(null);
    toast('Leistung gespeichert');
  };
  const loeschen = async (id: string) => {
    if (!confirm('Leistung entfernen? Bestehende KVs und Rechnungen bleiben unverändert.')) return;
    await saveEinstellungen({ leistungen: e.leistungen.filter((x) => x.id !== id) });
    setBearbeiten(null);
  };

  return (
    <>
      <Card
        title="Leistungen & Preise"
        action={
          <button className="btn small primary" onClick={() => setBearbeiten({ id: newId(), bezeichnung: '', positionsnummer: '', einheit: 'UE', preis: 0, typ: 'einheit', leistungsart: 'O&M' })}>
            + Leistung
          </button>
        }
      >
        <p className="small muted" style={{ marginTop: 0 }}>
          Preise gemäß Vertrag bzw. Vereinbarung mit dem jeweiligen Kostenträger eintragen. Sie werden als Vorschlag in neue Kostenvoranschläge übernommen.
        </p>
        <ul className="list">
          {e.leistungen.map((l) => (
            <li key={l.id}>
              <button className="list-item btn ghost" style={{ width: '100%', textAlign: 'left', fontWeight: 'normal', whiteSpace: 'normal' }} onClick={() => setBearbeiten(l)}>
                <div className="main">
                  <div className="title" style={{ whiteSpace: 'normal' }}>{l.bezeichnung}</div>
                  <div className="sub">
                    {l.positionsnummer} · {l.leistungsart} · {l.typ === 'einheit' ? 'je Einheit' : l.typ === 'km' ? 'je km' : 'Pauschale'}
                  </div>
                </div>
                <b>
                  {formatEuro(l.preis)}/{l.einheit}
                </b>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Sheet open={!!bearbeiten} onClose={() => setBearbeiten(null)} title="Leistung">
        {bearbeiten && (
          <LeistungForm l={bearbeiten} onSave={speichern} onDelete={e.leistungen.some((x) => x.id === bearbeiten.id) ? () => loeschen(bearbeiten.id) : undefined} />
        )}
      </Sheet>
    </>
  );
}

function LeistungForm({ l: start, onSave, onDelete }: { l: Leistung; onSave: (l: Leistung) => void; onDelete?: () => void }) {
  const [l, setL] = useState(start);
  const set = (p: Partial<Leistung>) => setL({ ...l, ...p });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(l);
      }}
    >
      <Field label="Bezeichnung">
        <input required value={l.bezeichnung} onChange={(e) => set({ bezeichnung: e.target.value })} />
      </Field>
      <div className="grid2">
        <Field label="Positionsnummer">
          <input value={l.positionsnummer} onChange={(e) => set({ positionsnummer: e.target.value })} />
        </Field>
        <Field label="Leistungsart">
          <select value={l.leistungsart} onChange={(e) => set({ leistungsart: e.target.value as Leistungsart })}>
            <option>O&M</option>
            <option>LPF</option>
            <option>Sonstige</option>
          </select>
        </Field>
        <Field label="Abrechnungsart">
          <select value={l.typ} onChange={(e) => set({ typ: e.target.value as PositionTyp })}>
            <option value="einheit">je geleisteter Einheit</option>
            <option value="pauschal">Pauschale</option>
            <option value="km">je gefahrenem km</option>
          </select>
        </Field>
        <Field label="Einheit">
          <input value={l.einheit} onChange={(e) => set({ einheit: e.target.value })} />
        </Field>
        <Field label="Preis (€)">
          <input type="number" step="0.01" min={0} value={l.preis} onChange={(e) => set({ preis: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="form-actions">
        {onDelete && (
          <button type="button" className="btn danger" onClick={onDelete}>
            Entfernen
          </button>
        )}
        <button className="btn primary">Speichern</button>
      </div>
    </form>
  );
}

const KT_TYPEN: KostentraegerTyp[] = ['GKV', 'PKV', 'Beihilfe', 'Sozialhilfe', 'Eingliederungshilfe', 'BG', 'DRV', 'Agentur', 'Selbstzahler', 'Sonstige'];

function KostentraegerListe() {
  const kts = useLiveQuery(() => db.kostentraeger.orderBy('name').toArray(), []);
  const [edit, setEdit] = useState<Kostentraeger | null>(null);
  const toast = useToast();
  const leer = (): Kostentraeger => ({ id: newId(), name: '', typ: 'GKV', ik: '', adresse: { strasse: '', plz: '', ort: '' } });

  return (
    <>
      <Card title="Kostenträger" action={<button className="btn small primary" onClick={() => setEdit(leer())}>+ Neu</button>}>
        {kts?.length === 0 && <Empty>Noch keine Kostenträger.</Empty>}
        <ul className="list">
          {kts?.map((k) => (
            <li key={k.id}>
              <button className="list-item btn ghost" style={{ width: '100%', textAlign: 'left', fontWeight: 'normal' }} onClick={() => setEdit(k)}>
                <div className="main">
                  <div className="title">{k.name}</div>
                  <div className="sub">
                    {k.typ}
                    {k.ik ? ` · IK ${k.ik}` : ''} · {k.adresse.ort}
                  </div>
                </div>
                <Icon name="edit" size={18} />
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Kostenträger">
        {edit && (
          <AdressbuchForm
            daten={edit}
            onSave={async (k) => {
              await db.kostentraeger.put(k as Kostentraeger);
              setEdit(null);
              toast('Gespeichert');
            }}
            onDelete={async () => {
              const n = await db.patienten.filter((p) => p.versicherung.kostentraegerId === edit.id).count();
              if (n > 0) return alert(`Wird noch von ${n} Patient(en) verwendet.`);
              if (confirm('Kostenträger löschen?')) {
                await db.kostentraeger.delete(edit.id);
                setEdit(null);
              }
            }}
          >
            {(d, set) => (
              <>
                <Field label="Name *">
                  <input required value={d.name} onChange={(e) => set({ name: e.target.value })} />
                </Field>
                <div className="grid2">
                  <Field label="Art">
                    <select value={d.typ} onChange={(e) => set({ typ: e.target.value as KostentraegerTyp })}>
                      {KT_TYPEN.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="IK">
                    <input inputMode="numeric" maxLength={9} value={d.ik} onChange={(e) => set({ ik: e.target.value.replace(/\D/g, '') })} />
                  </Field>
                </div>
                <AdressFelder a={d.adresse} onChange={(adresse) => set({ adresse })} />
                <div className="grid2">
                  <Field label="Telefon">
                    <input value={d.telefon ?? ''} onChange={(e) => set({ telefon: e.target.value })} />
                  </Field>
                  <Field label="Fax">
                    <input value={d.fax ?? ''} onChange={(e) => set({ fax: e.target.value })} />
                  </Field>
                </div>
                <Field label="E-Mail">
                  <input type="email" value={d.email ?? ''} onChange={(e) => set({ email: e.target.value })} />
                </Field>
              </>
            )}
          </AdressbuchForm>
        )}
      </Sheet>
    </>
  );
}

function AerzteListe() {
  const aerzte = useLiveQuery(() => db.aerzte.orderBy('name').toArray(), []);
  const [edit, setEdit] = useState<Arzt | null>(null);
  const toast = useToast();
  const leer = (): Arzt => ({ id: newId(), titel: 'Dr. med.', name: '', fachrichtung: 'Augenheilkunde', adresse: { strasse: '', plz: '', ort: '' } });

  return (
    <>
      <Card title="Verordnende Ärzte" action={<button className="btn small primary" onClick={() => setEdit(leer())}>+ Neu</button>}>
        {aerzte?.length === 0 && <Empty>Noch keine Ärzte.</Empty>}
        <ul className="list">
          {aerzte?.map((a) => (
            <li key={a.id}>
              <button className="list-item btn ghost" style={{ width: '100%', textAlign: 'left', fontWeight: 'normal' }} onClick={() => setEdit(a)}>
                <div className="main">
                  <div className="title">{[a.titel, a.name].filter(Boolean).join(' ')}</div>
                  <div className="sub">
                    {a.fachrichtung} · {a.adresse.ort}
                  </div>
                </div>
                <Icon name="edit" size={18} />
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Arzt">
        {edit && (
          <AdressbuchForm
            daten={edit}
            onSave={async (a) => {
              await db.aerzte.put(a as Arzt);
              setEdit(null);
              toast('Gespeichert');
            }}
            onDelete={async () => {
              const n = await db.rezepte.filter((r) => r.arztId === edit.id).count();
              if (n > 0) return alert(`Wird noch in ${n} Rezept(en) verwendet.`);
              if (confirm('Arzt löschen?')) {
                await db.aerzte.delete(edit.id);
                setEdit(null);
              }
            }}
          >
            {(d, set) => (
              <>
                <div className="grid2">
                  <Field label="Titel">
                    <input value={d.titel ?? ''} onChange={(e) => set({ titel: e.target.value })} />
                  </Field>
                  <Field label="Name *">
                    <input required value={d.name} onChange={(e) => set({ name: e.target.value })} />
                  </Field>
                  <Field label="Fachrichtung">
                    <input value={d.fachrichtung} onChange={(e) => set({ fachrichtung: e.target.value })} />
                  </Field>
                  <Field label="Telefon">
                    <input value={d.telefon ?? ''} onChange={(e) => set({ telefon: e.target.value })} />
                  </Field>
                  <Field label="BSNR">
                    <input value={d.bsnr ?? ''} onChange={(e) => set({ bsnr: e.target.value })} />
                  </Field>
                  <Field label="LANR">
                    <input value={d.lanr ?? ''} onChange={(e) => set({ lanr: e.target.value })} />
                  </Field>
                </div>
                <AdressFelder a={d.adresse} onChange={(adresse) => set({ adresse })} />
              </>
            )}
          </AdressbuchForm>
        )}
      </Sheet>
    </>
  );
}

function AdressbuchForm<T extends { id: string }>({
  daten,
  onSave,
  onDelete,
  children,
}: {
  daten: T;
  onSave: (d: T) => void;
  onDelete: () => void;
  children: (d: T, set: (p: Partial<T>) => void) => React.ReactNode;
}) {
  const [d, setD] = useState(daten);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(d);
      }}
    >
      {children(d, (p) => setD({ ...d, ...p }))}
      <div className="form-actions">
        <button type="button" className="btn danger" onClick={onDelete}>
          Löschen
        </button>
        <span className="spacer" />
        <button className="btn primary">Speichern</button>
      </div>
    </form>
  );
}
