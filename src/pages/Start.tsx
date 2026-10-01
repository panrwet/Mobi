import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../db/db';
import { Page } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Badge, Card, Empty, ListLink } from '../components/ui';
import { addDays, daysBetween, formatDate, formatEuro, formatTime, isoDate, parseDate, patientName, startOfDay } from '../lib/format';
import { useEinstellungen, useRezeptInfos } from '../lib/hooks';
import { prioritaet, TERMIN_STATUS } from '../lib/status';

const kacheln: [string, string, string][] = [
  ['/patienten', 'users', 'Patienten'],
  ['/kalender', 'calendar', 'Kalender'],
  ['/rezepte', 'rx', 'Rezepte'],
  ['/rechnungen', 'euro', 'Rechnungen'],
  ['/stammdaten', 'briefcase', 'Stammdaten'],
  ['/einstellungen', 'settings', 'Einstellungen'],
];

export function Start() {
  const e = useEinstellungen();
  const infos = useRezeptInfos();
  const heute = startOfDay(new Date());
  const morgen = addDays(heute, 1);

  const heuteTermine = useLiveQuery(async () => {
    const ts = await db.termine.where('start').between(heute.toISOString(), morgen.toISOString()).sortBy('start');
    const ps = await db.patienten.bulkGet(ts.map((t) => t.patientId));
    return ts.map((t, i) => ({ t, p: ps[i] }));
  }, [heute.toISOString()]);

  const rechnungen = useLiveQuery(() => db.rechnungen.toArray(), []);

  const offen = (infos ?? []).filter((i) => i.a.offen).sort((a, b) => prioritaet(a.a) - prioritaet(b.a));
  const abgeschlossen = (infos ?? [])
    .filter((i) => i.a.phase === 'abgeschlossen')
    .sort((a, b) => (b.a.aktiveRechnung?.bezahltAm ?? '').localeCompare(a.a.aktiveRechnung?.bezahltAm ?? ''));

  const heuteIso = isoDate();
  const offeneRe = (rechnungen ?? []).filter((r) => r.status === 'offen');
  const ueberfaellig = offeneRe.filter((r) => r.faelligAm < heuteIso);
  const summeOffen = offeneRe.reduce((s, r) => s + r.zahlbetrag, 0);
  const abrechenbar = offen.filter((i) => i.a.phase === 'abrechenbar').length;
  const mitWarnung = offen.filter((i) => i.a.warnungen.length > 0).length;

  const tageszeit = new Date().getHours() < 11 ? 'Guten Morgen' : new Date().getHours() < 18 ? 'Guten Tag' : 'Guten Abend';

  return (
    <Page title="Mobi">
      <div style={{ margin: '2px 2px 14px' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
          {tageszeit}, {e.name.split(' ')[0]}
        </div>
        <div className="muted small">
          {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <nav className="tiles" aria-label="Schnellzugriff">
        {kacheln.map(([to, icon, label]) => (
          <Link key={to} to={to} className="tile">
            <Icon name={icon} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="kpis">
        <Link to="/rezepte?filter=offen" className="kpi">
          <div className="v">{offen.length}</div>
          <div className="l">offene Rezepte{mitWarnung ? ` · ${mitWarnung} mit Hinweis` : ''}</div>
        </Link>
        <Link to="/rezepte?filter=abrechenbar" className="kpi">
          <div className="v">{abrechenbar}</div>
          <div className="l">abrechenbar</div>
        </Link>
        <Link to="/rechnungen" className="kpi">
          <div className="v" style={{ fontSize: '1.1rem', paddingTop: 4 }}>{formatEuro(summeOffen)}</div>
          <div className="l">
            offen{ueberfaellig.length ? <span style={{ color: 'var(--danger)' }}> · {ueberfaellig.length} überfällig</span> : ''}
          </div>
        </Link>
      </div>

      <Card title={`Heute (${heuteTermine?.length ?? 0})`} action={<Link to="/kalender" className="small">Kalender</Link>}>
        {heuteTermine && heuteTermine.length === 0 && <Empty>Heute keine Termine.</Empty>}
        <ul className="list">
          {heuteTermine?.map(({ t, p }) => (
            <ListLink
              key={t.id}
              to={`/termine/${t.id}`}
              left={
                <span className="timebox">
                  {formatTime(t.start)}
                  <small>{t.dauerMin} Min.</small>
                </span>
              }
              title={patientName(p, 'vn')}
              sub={t.ort}
              right={<Badge tone={TERMIN_STATUS[t.status].tone}>{TERMIN_STATUS[t.status].label}</Badge>}
            />
          ))}
        </ul>
      </Card>

      <Card
        title={
          <span className="row">
            <Icon name="inbox" size={20} /> Eingangsliste ({offen.length})
          </span>
        }
        action={<Link to="/rezepte/neu" className="btn small primary">+ Rezept</Link>}
      >
        {infos && offen.length === 0 && <Empty>Alles erledigt – keine offenen Rezepte.</Empty>}
        <ul className="list">
          {offen.map(({ rezept, patient, a }) => (
            <li key={rezept.id}>
              <Link to={`/rezepte/${rezept.id}`} className="list-item" style={{ alignItems: 'flex-start' }}>
                <div className="main">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="title">{patientName(patient)}</span>
                    <Badge tone={a.tone}>{a.label}</Badge>
                  </div>
                  <div className="sub">
                    {rezept.nummer} · {rezept.leistungsart} · {a.geleistetEinheiten}/{a.zielEinheiten} UE
                  </div>
                  <div className="small" style={{ marginTop: 2, fontWeight: 600 }}>
                    → {a.aktion}
                  </div>
                  {a.warnungen.map((w) => (
                    <div key={w.text} className="small" style={{ color: w.tone === 'danger' ? 'var(--danger)' : 'var(--warn)' }}>
                      ⚠ {w.text}
                    </div>
                  ))}
                </div>
                <span className="chev">
                  <Icon name="chevron" size={18} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Rechnungen" action={<Link to="/rechnungen" className="small">Alle</Link>}>
        {offeneRe.length === 0 && <Empty>Keine offenen Rechnungen.</Empty>}
        <ul className="list">
          {offeneRe
            .sort((a, b) => a.faelligAm.localeCompare(b.faelligAm))
            .slice(0, 5)
            .map((r) => {
              const tage = daysBetween(parseDate(r.faelligAm)!, new Date());
              return (
                <ListLink
                  key={r.id}
                  to={`/rechnungen/${r.id}`}
                  title={`${r.nummer} · ${r.patientInfo.name}`}
                  sub={`${r.empfaenger.name} · fällig ${formatDate(r.faelligAm)}`}
                  right={
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700 }}>{formatEuro(r.zahlbetrag)}</div>
                      {tage > 0 ? <Badge tone="danger">{tage} T überfällig</Badge> : <Badge tone="neutral">offen</Badge>}
                    </div>
                  }
                />
              );
            })}
        </ul>
      </Card>

      <Card title={`Abgeschlossene Rezepte (${abgeschlossen.length})`} action={<Link to="/rezepte?filter=abgeschlossen" className="small">Alle</Link>}>
        {abgeschlossen.length === 0 && <Empty>Noch keine abgeschlossenen Rezepte.</Empty>}
        <ul className="list">
          {abgeschlossen.slice(0, 5).map(({ rezept, patient, a }) => (
            <ListLink
              key={rezept.id}
              to={`/rezepte/${rezept.id}`}
              title={patientName(patient)}
              sub={`${rezept.nummer} · ${a.geleistetEinheiten} UE · bezahlt ${formatDate(a.aktiveRechnung?.bezahltAm)}`}
              right={<Badge tone="ok">✓</Badge>}
            />
          ))}
        </ul>
      </Card>
    </Page>
  );
}
