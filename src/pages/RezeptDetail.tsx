import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db, newId } from '../db/db';
import { BERICHT_TITEL, createRechnung, kvAntwort, kvVersenden, kvWiderspruch, reaktiviereRezept, storniereRezept } from '../db/actions';
import { Dokumente } from '../components/Dokumente';
import type { KVStatus, Position, Termin } from '../db/types';
import { Page } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Alert, Badge, Card, Empty, Field, ListLink, Sheet, Tabs, useToast } from '../components/ui';
import { positionBetrag, rechnungsPositionen, summePositionen } from '../lib/abrechnung';
import { formatDate, formatDateTime, formatEuro, formatTime, formatWeekday, isoDate, patientName } from '../lib/format';
import { useEinstellungen, useRezeptInfos } from '../lib/hooks';
import { pdf } from '../lib/pdfLazy';
import { konflikte, serienTermine } from '../lib/planung';
import { KV_STATUS, TERMIN_STATUS } from '../lib/status';

type Tab = 'uebersicht' | 'kv' | 'termine' | 'rechnung' | 'berichte' | 'dokumente' | 'verlauf';

export function RezeptDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const e = useEinstellungen();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'uebersicht';
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });

  const alle = useRezeptInfos();
  const info = alle?.find((i) => i.rezept.id === id);
  const arzt = useLiveQuery(async () => (info?.rezept.arztId ? db.aerzte.get(info.rezept.arztId) : undefined), [info?.rezept.arztId]);
  const [antwortOffen, setAntwortOffen] = useState(false);
  const [serieOffen, setSerieOffen] = useState(false);
  const [widerspruchOffen, setWiderspruchOffen] = useState(false);

  if (!alle) return <Page title="Rezept" back>…</Page>;
  if (!info) return <Page title="Rezept" back><Empty>Rezept nicht gefunden.</Empty></Page>;

  const { rezept: r, patient: p, kostentraeger: kt, termine, rechnungen, a } = info;
  const vorgaenger = alle.find((i) => i.rezept.id === r.vorgaengerId);
  const nachfolger = alle.filter((i) => i.rezept.vorgaengerId === r.id);
  const kv = r.kv;
  const sortiert = [...termine].sort((x, y) => x.start.localeCompare(y.start));

  const naechsteAktion = () => {
    switch (a.phase) {
      case 'neu':
      case 'kv_entwurf':
        return nav(`/rezepte/${r.id}/kv`);
      case 'kv_versendet':
        return setAntwortOffen(true);
      case 'genehmigt':
        return setSerieOffen(true);
      case 'termine_verplant':
      case 'in_behandlung': {
        const t = sortiert.find((x) => x.status === 'geplant');
        return t ? nav(`/termine/${t.id}`) : setSerieOffen(true);
      }
      case 'doku_offen': {
        const t = sortiert.find((x) => x.status === 'durchgefuehrt' && !x.doku?.inhalte.trim());
        return t && nav(`/termine/${t.id}`);
      }
      case 'abrechenbar':
        return setTab('rechnung');
      case 'abgerechnet':
        return a.aktiveRechnung && nav(`/rechnungen/${a.aktiveRechnung.id}`);
      case 'kv_abgelehnt':
        setTab('kv');
        return setWiderspruchOffen(true);
      case 'kv_widerspruch':
        return setAntwortOffen(true);
    }
  };

  const versenden = async () => {
    if (!kv) return;
    await kvVersenden(r.id, isoDate());
    toast('KV als versendet markiert');
  };

  const kvAlsPdf = () => p && pdf((m) => m.kvPdf(r, p, e, kt, arzt), `${kv?.nummer}.pdf`);

  const rechnungErstellen = async (art: 'teil' | 'schluss') => {
    if (art === 'schluss' && a.phase !== 'abrechenbar' && !confirm('Es sind noch nicht alle genehmigten Einheiten geleistet und dokumentiert. Trotzdem die Schlussrechnung erstellen (Behandlung vorzeitig beendet)?')) return;
    try {
      const reId = await createRechnung(r.id, art);
      toast('Rechnung erstellt');
      nav(`/rechnungen/${reId}`);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const stornieren = async () => {
    const grund = prompt('Rezept stornieren – Grund (optional):');
    if (grund === null) return;
    await storniereRezept(r.id, grund);
    toast('Rezept storniert');
  };

  const offeneEinheiten = Math.max(0, a.zielEinheiten - a.geleistetEinheiten - a.geplantEinheiten);
  const frueherePositionen = rechnungen.filter((x) => x.status !== 'storniert').flatMap((x) => x.positionen);
  const vorschau = kv ? rechnungsPositionen(kv.positionen, termine, frueherePositionen, 'schluss') : [];
  const schlussVorhanden = rechnungen.some((x) => x.status !== 'storniert' && x.art !== 'teil');
  const kvOk = kv?.status === 'genehmigt' || kv?.status === 'teilgenehmigt';

  return (
    <Page
      title={patientName(p, 'vn')}
      back
      actions={
        <button className="icon-btn" aria-label="Rezept bearbeiten" onClick={() => nav(`/rezepte/${r.id}/bearbeiten`)}>
          <Icon name="edit" />
        </button>
      }
    >
      <Card>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700 }}>
              {r.nummer} · {r.leistungsart}
            </div>
            <div className="muted small">
              <Link to={`/patienten/${r.patientId}`}>{patientName(p)}</Link> · {kt?.name ?? 'Selbstzahler'}
            </div>
          </div>
          <Badge tone={a.tone}>{a.label}</Badge>
        </div>
        <div className="steps" aria-hidden="true">
          {a.schritte.map((s) => (
            <span key={s.label} className={s.erledigt ? 'done' : ''} title={s.label} />
          ))}
        </div>
        <div className="steps-labels">
          {a.schritte.map((s) => (
            <span key={s.label} className={s.erledigt ? 'done' : ''}>
              {s.erledigt ? '✓' : '○'} {s.label}
            </span>
          ))}
        </div>
        {vorgaenger && (
          <div className="small" style={{ marginTop: 8 }}>
            ↳ Folgeverordnung zu <Link to={`/rezepte/${vorgaenger.rezept.id}`}>{vorgaenger.rezept.nummer}</Link> ({vorgaenger.a.geleistetEinheiten} UE geleistet)
          </div>
        )}
        {nachfolger.map((n) => (
          <div key={n.rezept.id} className="small" style={{ marginTop: 8 }}>
            → Folgeverordnung: <Link to={`/rezepte/${n.rezept.id}`}>{n.rezept.nummer}</Link> ({n.a.label})
          </div>
        ))}
        {a.warnungen.map((w) => (
          <Alert key={w.text} tone={w.tone}>
            {w.text}
          </Alert>
        ))}
        {a.offen && (
          <button className="btn primary block" style={{ marginTop: 10 }} onClick={naechsteAktion}>
            {a.aktion}
          </button>
        )}
      </Card>

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          ['uebersicht', 'Übersicht'],
          ['kv', 'KV'],
          ['termine', `Termine (${termine.length})`],
          ['rechnung', 'Rechnung'],
          ['berichte', `Berichte${r.berichte?.length ? ` (${r.berichte.length})` : ''}`],
          ['dokumente', 'Dokumente'],
          ['verlauf', 'Verlauf'],
        ]}
      />

      {tab === 'uebersicht' && (
        <>
          {!r.storniert && (
            <Link to={`/rezepte/neu?folge=${r.id}`} className="btn block" style={{ marginBottom: 14 }}>
              <Icon name="repeat" size={18} /> Folgeverordnung anlegen
            </Link>
          )}
          <Card title="Einheiten">
            <div className="progress" aria-label="Fortschritt Einheiten">
              <i style={{ width: `${Math.min(100, (a.geleistetEinheiten / Math.max(1, a.zielEinheiten)) * 100)}%` }} />
              <i className="plan" style={{ width: `${Math.min(100, (a.geplantEinheiten / Math.max(1, a.zielEinheiten)) * 100)}%` }} />
            </div>
            <div className="row small muted" style={{ marginTop: 6, justifyContent: 'space-between' }}>
              <span>{a.geleistetEinheiten} geleistet</span>
              <span>{a.geplantEinheiten} geplant</span>
              <span>{offeneEinheiten} offen</span>
              <span>Ziel {a.zielEinheiten}</span>
            </div>
          </Card>
          <Card title="Verordnung">
            <dl className="dl">
              <dt>Ausgestellt</dt>
              <dd>{formatDate(r.ausstellungsdatum)}</dd>
              <dt>Eingang</dt>
              <dd>{formatDate(r.eingangsdatum)}</dd>
              <dt>Arzt</dt>
              <dd>{arzt ? `${[arzt.titel, arzt.name].filter(Boolean).join(' ')} (${arzt.fachrichtung})` : '–'}</dd>
              <dt>Diagnose</dt>
              <dd>
                {r.diagnose} {r.icd10 && <span className="muted">({r.icd10})</span>}
              </dd>
              <dt>Verordnung</dt>
              <dd>{r.verordnung}</dd>
              <dt>Verordnet</dt>
              <dd>{r.verordneteEinheiten} Einheiten</dd>
              {kv?.genehmigteEinheiten !== undefined && (
                <>
                  <dt>Genehmigt</dt>
                  <dd>
                    {kv.genehmigteEinheiten} Einheiten {kv.genehmigungsnummer && <span className="muted">· Nr. {kv.genehmigungsnummer}</span>}
                  </dd>
                </>
              )}
              {r.notizen && (
                <>
                  <dt>Notizen</dt>
                  <dd style={{ whiteSpace: 'pre-wrap' }}>{r.notizen}</dd>
                </>
              )}
            </dl>
          </Card>
        </>
      )}

      {tab === 'kv' && (
        <Card
          title={kv ? `Kostenvoranschlag ${kv.nummer}` : 'Kostenvoranschlag'}
          action={kv && <Badge tone={KV_STATUS[kv.status].tone}>{KV_STATUS[kv.status].label}</Badge>}
        >
          {!kv && (
            <>
              <Empty>Für dieses Rezept wurde noch kein Kostenvoranschlag erstellt.</Empty>
              <Link to={`/rezepte/${r.id}/kv`} className="btn primary block">
                Kostenvoranschlag erstellen
              </Link>
            </>
          )}
          {kv && (
            <>
              <dl className="dl" style={{ marginBottom: 12 }}>
                <dt>Datum</dt>
                <dd>{formatDate(kv.datum)}</dd>
                <dt>Versendet</dt>
                <dd>{formatDate(kv.versendetAm)}</dd>
                <dt>Antwort</dt>
                <dd>{formatDate(kv.antwortAm)}</dd>
                {kv.genehmigungsnummer && (
                  <>
                    <dt>Genehmigungs-Nr.</dt>
                    <dd>{kv.genehmigungsnummer}</dd>
                  </>
                )}
                {kv.antwortNotiz && (
                  <>
                    <dt>Notiz</dt>
                    <dd>{kv.antwortNotiz}</dd>
                  </>
                )}
                {kv.widerspruchAm && (
                  <>
                    <dt>Widerspruch</dt>
                    <dd>{formatDate(kv.widerspruchAm)}</dd>
                  </>
                )}
              </dl>
              <PositionenTabelle positionen={kv.positionen} />
              <div className="form-actions">
                <button className="btn" onClick={kvAlsPdf}>
                  <Icon name="pdf" size={18} /> PDF
                </button>
                <Link className="btn" to={`/rezepte/${r.id}/kv`}>
                  <Icon name="edit" size={18} /> Bearbeiten
                </Link>
                {kv.status === 'entwurf' && (
                  <button className="btn primary" onClick={versenden}>
                    <Icon name="send" size={18} /> Als versendet markieren
                  </button>
                )}
                {kv.status === 'abgelehnt' && (
                  <button className="btn" onClick={() => setWiderspruchOffen(true)}>
                    Widerspruch einlegen
                  </button>
                )}
                {kv.status === 'widerspruch' && (
                  <button className="btn" onClick={() => p && pdf((m) => m.widerspruchPdf(r, p, e, kt), `Widerspruch-${kv.nummer}.pdf`)}>
                    <Icon name="pdf" size={18} /> Widerspruch
                  </button>
                )}
                {kv.status !== 'entwurf' && (
                  <button className="btn primary" onClick={() => setAntwortOffen(true)}>
                    Antwort / Genehmigung erfassen
                  </button>
                )}
              </div>
            </>
          )}
        </Card>
      )}

      {tab === 'termine' && (
        <Card
          title="Termine"
          action={
            <div className="row">
              <button className="btn small" onClick={() => p && pdf((m) => m.dokuPdf(r, p, termine, e), `Leistungsnachweis-${r.nummer}.pdf`)} disabled={!termine.length}>
                <Icon name="pdf" size={16} /> Nachweis
              </button>
            </div>
          }
        >
          <div className="row wrap" style={{ marginBottom: 10 }}>
            <Link to={`/termine/neu?rezept=${r.id}`} className="btn small primary">
              + Termin
            </Link>
            <button className="btn small" onClick={() => setSerieOffen(true)}>
              <Icon name="repeat" size={16} /> Serie planen
            </button>
          </div>
          {sortiert.length === 0 && <Empty>Noch keine Termine geplant.</Empty>}
          <ul className="list">
            {sortiert.map((t) => (
              <ListLink
                key={t.id}
                to={`/termine/${t.id}`}
                left={
                  <span className="timebox">
                    {formatDate(t.start).slice(0, 6)}
                    <small>
                      {formatWeekday(new Date(t.start))} {formatTime(t.start)}
                    </small>
                  </span>
                }
                title={t.ort || '–'}
                sub={t.status === 'durchgefuehrt' ? (t.doku?.inhalte ? t.doku.inhalte : '⚠ Dokumentation fehlt') : t.notiz}
                right={<Badge tone={TERMIN_STATUS[t.status].tone}>{TERMIN_STATUS[t.status].label}</Badge>}
              />
            ))}
          </ul>
        </Card>
      )}

      {tab === 'rechnung' && (
        <Card title="Rechnungen">
          {rechnungen.length > 0 && (
            <ul className="list" style={{ marginBottom: 10 }}>
              {[...rechnungen]
                .sort((x, y) => x.datum.localeCompare(y.datum))
                .map((re) => (
                  <ListLink
                    key={re.id}
                    to={`/rechnungen/${re.id}`}
                    title={`${re.art === 'teil' ? 'Teilrechnung' : 'Schlussrechnung'} ${re.nummer}`}
                    sub={`vom ${formatDate(re.datum)} · ${formatEuro(re.zahlbetrag)}`}
                    right={<Badge tone={re.status === 'bezahlt' ? 'ok' : re.status === 'storniert' ? 'neutral' : 'warn'}>{re.status}</Badge>}
                  />
                ))}
            </ul>
          )}
          {!kv && <Empty>Zuerst Kostenvoranschlag erstellen und genehmigen lassen.</Empty>}
          {kv && !kvOk && !schlussVorhanden && <Empty>Der KV ist noch nicht genehmigt.</Empty>}
          {kvOk && !schlussVorhanden && (
            <>
              {vorschau.length > 0 ? (
                <>
                  <p className="small muted">
                    Noch nicht abgerechnet: {a.nichtAbgerechnet} UE. Vorschau Schlussrechnung:
                  </p>
                  <PositionenTabelle positionen={vorschau} />
                </>
              ) : (
                <Empty>Noch keine (weiteren) geleisteten Einheiten.</Empty>
              )}
              <div className="form-actions">
                <button className="btn" disabled={a.nichtAbgerechnet === 0} onClick={() => rechnungErstellen('teil')}>
                  Teilrechnung
                </button>
                <button className="btn primary" disabled={vorschau.length === 0} onClick={() => rechnungErstellen('schluss')}>
                  Schlussrechnung erstellen
                </button>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>
                Teilrechnung: rechnet die bisher geleisteten Einheiten ab (z. B. bei langen Trainings). Die Schlussrechnung enthält alle restlichen Leistungen inkl. Abschlussbericht.
              </p>
            </>
          )}
        </Card>
      )}

      {tab === 'berichte' && (
        <Card title="Berichte an Arzt / Kostenträger">
          {(r.berichte ?? []).length === 0 && <Empty>Noch keine Berichte.</Empty>}
          <ul className="list">
            {(r.berichte ?? []).map((b) => (
              <ListLink
                key={b.id}
                to={`/rezepte/${r.id}/bericht/${b.id}`}
                left={<Icon name="report" />}
                title={BERICHT_TITEL[b.typ]}
                sub={`${formatDate(b.datum)} · ${b.empfaenger === 'arzt' ? 'an Arzt' : b.empfaenger === 'kostentraeger' ? 'an Kostenträger' : 'an Kostenträger + Arzt'}`}
                right={b.versendetAm ? <Badge tone="ok">versendet</Badge> : <Badge tone="info">Entwurf</Badge>}
              />
            ))}
          </ul>
          <div className="form-actions">
            <Link className="btn small" to={`/rezepte/${r.id}/bericht/neu?typ=eingang`}>
              + Eingangsbefund
            </Link>
            <Link className="btn small" to={`/rezepte/${r.id}/bericht/neu?typ=verlauf`}>
              + Verlaufsbericht
            </Link>
            <Link className="btn small primary" to={`/rezepte/${r.id}/bericht/neu?typ=abschluss`}>
              + Abschlussbericht
            </Link>
          </div>
        </Card>
      )}

      {tab === 'dokumente' && <Dokumente patientId={r.patientId} rezeptId={r.id} titel="Dokumente zu diesem Rezept" />}

      {tab === 'verlauf' && (
        <>
          <Card title="Verlauf">
            <ul className="timeline">
              {[...r.verlauf].reverse().map((v, i) => (
                <li key={i}>
                  <div>{v.text}</div>
                  <div className="muted small">{formatDateTime(v.datum)}</div>
                </li>
              ))}
            </ul>
          </Card>
          {r.storniert ? (
            <button className="btn block" onClick={() => reaktiviereRezept(r.id)}>
              Rezept reaktivieren
            </button>
          ) : (
            a.offen && (
              <button className="btn danger block" onClick={stornieren}>
                Rezept stornieren
              </button>
            )
          )}
        </>
      )}

      {kv && <KVAntwortSheet open={antwortOffen} onClose={() => setAntwortOffen(false)} rezeptId={r.id} vorschlag={kv.genehmigteEinheiten ?? r.verordneteEinheiten} status={kv.status} nummer={kv.genehmigungsnummer} />}
      <WiderspruchSheet open={widerspruchOffen} onClose={() => setWiderspruchOffen(false)} rezeptId={r.id} />
      <SerieSheet
        open={serieOffen}
        onClose={() => setSerieOffen(false)}
        rezeptId={r.id}
        patientId={r.patientId}
        vorschlagAnzahl={offeneEinheiten || 1}
        standardDauer={e.standardDauerMin}
      />
    </Page>
  );
}

export function PositionenTabelle({ positionen }: { positionen: Position[] }) {
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Leistung</th>
            <th className="num hide-sm">Menge</th>
            <th className="num hide-sm">Preis</th>
            <th className="num">Betrag</th>
          </tr>
        </thead>
        <tbody>
          {positionen.map((p, i) => (
            <tr key={i}>
              <td>
                {p.bezeichnung}
                <div className="show-sm muted small">
                  {p.menge.toLocaleString('de-DE')} {p.einheit} × {formatEuro(p.einzelpreis)}
                </div>
              </td>
              <td className="num hide-sm">
                {p.menge.toLocaleString('de-DE')} {p.einheit}
              </td>
              <td className="num hide-sm">{formatEuro(p.einzelpreis)}</td>
              <td className="num">{formatEuro(positionBetrag(p))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Summe</td>
            <td className="hide-sm" />
            <td className="hide-sm" />
            <td className="num">{formatEuro(summePositionen(positionen))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function KVAntwortSheet({ open, onClose, rezeptId, vorschlag, status, nummer }: { open: boolean; onClose: () => void; rezeptId: string; vorschlag: number; status: KVStatus; nummer?: string }) {
  const toast = useToast();
  const [s, setS] = useState<KVStatus>(status === 'versendet' || status === 'entwurf' ? 'genehmigt' : status);
  const [datum, setDatum] = useState(isoDate());
  const [nr, setNr] = useState(nummer ?? '');
  const [einheiten, setEinheiten] = useState(vorschlag);
  const [notiz, setNotiz] = useState('');

  const speichern = async () => {
    await kvAntwort(rezeptId, {
      status: s,
      antwortAm: datum,
      genehmigungsnummer: nr || undefined,
      genehmigteEinheiten: s === 'abgelehnt' ? undefined : einheiten,
      antwortNotiz: notiz || undefined,
    });
    toast('Antwort gespeichert');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Antwort des Kostenträgers">
      <div className="chips">
        {(['genehmigt', 'teilgenehmigt', 'abgelehnt'] as KVStatus[]).map((x) => (
          <button key={x} className={`chip ${s === x ? 'active' : ''}`} onClick={() => setS(x)}>
            {KV_STATUS[x].label}
          </button>
        ))}
      </div>
      <Field label="Datum des Bescheids">
        <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
      </Field>
      {s !== 'abgelehnt' && (
        <div className="grid2">
          <Field label="Genehmigungsnummer">
            <input value={nr} onChange={(e) => setNr(e.target.value)} />
          </Field>
          <Field label="Genehmigte Einheiten">
            <input type="number" min={1} value={einheiten} onChange={(e) => setEinheiten(Number(e.target.value))} />
          </Field>
        </div>
      )}
      <Field label={s === 'abgelehnt' ? 'Ablehnungsgrund / Widerspruchsfrist' : 'Notiz'}>
        <textarea value={notiz} onChange={(e) => setNotiz(e.target.value)} />
      </Field>
      <button className="btn primary block" onClick={speichern}>
        Speichern
      </button>
    </Sheet>
  );
}

function WiderspruchSheet({ open, onClose, rezeptId }: { open: boolean; onClose: () => void; rezeptId: string }) {
  const toast = useToast();
  const [datum, setDatum] = useState(isoDate());
  const [text, setText] = useState(
    'Das Training im Gebrauch des Blindenlangstocks ist untrennbarer Bestandteil der Hilfsmittelversorgung (§ 33 Abs. 1 SGB V). Ohne Training ist ein sicherer Gebrauch des Hilfsmittels nicht möglich. ',
  );
  return (
    <Sheet open={open} onClose={onClose} title="Widerspruch einlegen">
      <Field label="Datum des Widerspruchs">
        <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
      </Field>
      <Field label="Begründung">
        <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <p className="hint">Widerspruchsfrist in der Regel 1 Monat ab Bekanntgabe des Bescheids. Das Schreiben kann anschließend als PDF erstellt werden.</p>
      <button
        className="btn primary block"
        onClick={async () => {
          await kvWiderspruch(rezeptId, datum, text);
          toast('Widerspruch vermerkt');
          onClose();
        }}
      >
        Widerspruch vermerken
      </button>
    </Sheet>
  );
}

const WT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function SerieSheet({ open, onClose, rezeptId, patientId, vorschlagAnzahl, standardDauer }: { open: boolean; onClose: () => void; rezeptId: string; patientId: string; vorschlagAnzahl: number; standardDauer: number }) {
  const toast = useToast();
  const morgen = new Date(Date.now() + 86400000);
  const [startDatum, setStartDatum] = useState(isoDate(morgen));
  const [uhrzeit, setUhrzeit] = useState('10:00');
  const [wochentage, setWochentage] = useState<number[]>([((morgen.getDay() + 6) % 7) + 1]);
  const [anzahl, setAnzahl] = useState(vorschlagAnzahl);
  const [dauer, setDauer] = useState(standardDauer);
  const [ort, setOrt] = useState('Hausbesuch');
  const [km, setKm] = useState(0);
  const alleTermine = useLiveQuery(() => db.termine.toArray(), []);

  const daten = serienTermine({ startDatum, uhrzeit, wochentage, anzahl, dauerMin: dauer });
  const mitKonflikt = daten.map((d) => ({ d, k: konflikte(d, dauer, alleTermine ?? []).length > 0 }));

  const anlegen = async () => {
    const neue: Termin[] = daten.map((d) => ({
      id: newId(),
      rezeptId,
      patientId,
      start: d.toISOString(),
      dauerMin: dauer,
      einheiten: Math.max(1, Math.round(dauer / 60)),
      ort,
      km: km || undefined,
      status: 'geplant',
    }));
    await db.termine.bulkAdd(neue);
    const r = await db.rezepte.get(rezeptId);
    if (r) await db.rezepte.update(rezeptId, { verlauf: [...r.verlauf, { datum: new Date().toISOString(), text: `${neue.length} Termine als Serie geplant` }] });
    toast(`${neue.length} Termine angelegt`);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Terminserie planen">
      <div className="grid2">
        <Field label="Ab Datum">
          <input type="date" value={startDatum} onChange={(e) => setStartDatum(e.target.value)} />
        </Field>
        <Field label="Uhrzeit">
          <input type="time" value={uhrzeit} onChange={(e) => setUhrzeit(e.target.value)} />
        </Field>
      </div>
      <Field label="Wochentage">
        <div className="chips">
          {WT.map((w, i) => (
            <button
              key={w}
              type="button"
              className={`chip ${wochentage.includes(i + 1) ? 'active' : ''}`}
              onClick={() => setWochentage((cur) => (cur.includes(i + 1) ? cur.filter((x) => x !== i + 1) : [...cur, i + 1]))}
            >
              {w}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid2">
        <Field label="Anzahl Termine">
          <input type="number" min={1} max={100} value={anzahl} onChange={(e) => setAnzahl(Number(e.target.value))} />
        </Field>
        <Field label="Dauer (Min.)">
          <input type="number" min={15} step={15} value={dauer} onChange={(e) => setDauer(Number(e.target.value))} />
        </Field>
        <Field label="Ort">
          <input value={ort} onChange={(e) => setOrt(e.target.value)} />
        </Field>
        <Field label="Fahrtstrecke je Termin (km)">
          <input type="number" min={0} value={km} onChange={(e) => setKm(Number(e.target.value))} />
        </Field>
      </div>
      {mitKonflikt.length > 0 && (
        <div className="small" style={{ marginBottom: 12 }}>
          <b>Vorschau:</b>{' '}
          {mitKonflikt.map(({ d, k }, i) => (
            <span key={i}>
              {i > 0 && ', '}
              <span style={{ color: k ? 'var(--danger)' : undefined, whiteSpace: 'nowrap' }}>
                {formatWeekday(d)} {d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                {k ? ' (Konflikt)' : ''}
              </span>
            </span>
          ))}
        </div>
      )}
      {mitKonflikt.some((x) => x.k) && <Alert tone="danger">Einige Termine überschneiden sich mit bestehenden Terminen.</Alert>}
      <button className="btn primary block" disabled={daten.length === 0} onClick={anlegen}>
        {daten.length} Termine anlegen
      </button>
    </Sheet>
  );
}
