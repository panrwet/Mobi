import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../db/db';
import type { Patient, Termin } from '../db/types';
import { Page } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Badge, Empty, Fab, Tabs } from '../components/ui';
import { addDays, formatTime, formatWeekday, isoDate, parseDate, patientName, sameDay, startOfDay, startOfWeek } from '../lib/format';
import { TERMIN_STATUS } from '../lib/status';

type Ansicht = 'tag' | 'woche' | 'monat';

export function Kalender() {
  const [params, setParams] = useSearchParams();
  const ansicht = (params.get('ansicht') as Ansicht) || 'tag';
  const [datum, setDatum] = useState(() => parseDate(params.get('datum') ?? '') ?? startOfDay(new Date()));
  const heute = startOfDay(new Date());

  const setAnsicht = (a: Ansicht) => setParams({ ansicht: a, datum: isoDate(datum) }, { replace: true });
  const waehle = (d: Date) => {
    setDatum(d);
    setParams({ ansicht, datum: isoDate(d) }, { replace: true });
  };

  // sichtbarer Zeitraum
  const monatStart = new Date(datum.getFullYear(), datum.getMonth(), 1);
  const rasterStart = ansicht === 'monat' ? startOfWeek(monatStart) : startOfWeek(datum);
  const rasterEnde = ansicht === 'monat' ? addDays(rasterStart, 42) : addDays(rasterStart, 7);

  const daten = useLiveQuery(async () => {
    const ts = await db.termine.where('start').between(rasterStart.toISOString(), rasterEnde.toISOString()).sortBy('start');
    const ps = await db.patienten.bulkGet([...new Set(ts.map((t) => t.patientId))]);
    const map = new Map(ps.filter((p): p is Patient => !!p).map((p) => [p.id, p]));
    return ts.map((t) => ({ t, p: map.get(t.patientId) }));
  }, [rasterStart.toISOString(), rasterEnde.toISOString()]);

  const amTag = (d: Date) => (daten ?? []).filter(({ t }) => sameDay(new Date(t.start), d));

  const blaettern = (richtung: number) => {
    if (ansicht === 'tag') waehle(addDays(datum, richtung));
    else if (ansicht === 'woche') waehle(addDays(datum, 7 * richtung));
    else waehle(new Date(datum.getFullYear(), datum.getMonth() + richtung, 1));
  };

  const titel =
    ansicht === 'monat'
      ? datum.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
      : ansicht === 'woche'
        ? `KW ${kw(datum)} · ${rasterStart.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} – ${addDays(rasterStart, 6).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`
        : datum.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  const neuStart = new Date(datum);
  neuStart.setHours(10, 0, 0, 0);

  return (
    <Page title="Kalender">
      <Tabs value={ansicht} onChange={setAnsicht} options={[['tag', 'Tag'], ['woche', 'Woche'], ['monat', 'Monat']]} />
      <div className="cal-head">
        <button className="icon-btn" aria-label="Zurück" onClick={() => blaettern(-1)}>
          <Icon name="left" />
        </button>
        <div className="title">{titel}</div>
        <button className="icon-btn" aria-label="Weiter" onClick={() => blaettern(1)}>
          <Icon name="right" />
        </button>
        {!sameDay(datum, heute) && (
          <button className="btn small" onClick={() => waehle(heute)}>
            Heute
          </button>
        )}
      </div>

      {ansicht === 'tag' && (
        <>
          <div className="weekstrip">
            {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(datum), i)).map((d) => (
              <button key={d.toISOString()} className={`${sameDay(d, datum) ? 'sel' : ''} ${sameDay(d, heute) ? 'today' : ''}`} onClick={() => waehle(d)}>
                {formatWeekday(d)}
                <b>{d.getDate()}</b>
                <span className="dots">
                  {amTag(d)
                    .slice(0, 4)
                    .map((_, i) => (
                      <i key={i} />
                    ))}
                </span>
              </button>
            ))}
          </div>
          <Agenda eintraege={amTag(datum)} />
        </>
      )}

      {ansicht === 'woche' && (
        <div className="week-grid">
          {Array.from({ length: 7 }, (_, i) => addDays(rasterStart, i)).map((d) => (
            <div key={d.toISOString()} className="day card" style={{ padding: 8, marginBottom: 0 }}>
              <h4 className={sameDay(d, heute) ? 'today' : ''}>
                <button className="btn ghost small" style={{ padding: 0, minHeight: 0 }} onClick={() => { setDatum(d); setParams({ ansicht: 'tag', datum: isoDate(d) }, { replace: true }); }}>
                  {formatWeekday(d)} {d.getDate()}.
                </button>
              </h4>
              {amTag(d).map(({ t, p }) => (
                <Link key={t.id} to={`/termine/${t.id}`} className={`mini-ev ${t.status}`}>
                  <b>{formatTime(t.start)}</b> {p?.nachname}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}

      {ansicht === 'monat' && (
        <>
          <div className="month">
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => (
              <div key={w} className="wd">
                {w}
              </div>
            ))}
            {Array.from({ length: 42 }, (_, i) => addDays(rasterStart, i)).map((d) => (
              <button
                key={d.toISOString()}
                className={`${d.getMonth() !== datum.getMonth() ? 'other' : ''} ${sameDay(d, datum) ? 'sel' : ''} ${sameDay(d, heute) ? 'today' : ''}`}
                onClick={() => waehle(d)}
              >
                {d.getDate()}
                <span className="dots">
                  {amTag(d)
                    .slice(0, 3)
                    .map((_, j) => (
                      <i key={j} />
                    ))}
                </span>
              </button>
            ))}
          </div>
          <h3 className="section-title">{datum.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          <Agenda eintraege={amTag(datum)} />
        </>
      )}

      <Fab to={`/termine/neu?start=${encodeURIComponent(neuStart.toISOString())}`} label="Neuer Termin" />
    </Page>
  );
}

function Agenda({ eintraege }: { eintraege: { t: Termin; p?: Patient }[] }) {
  if (eintraege.length === 0) return <Empty>Keine Termine an diesem Tag.</Empty>;
  return (
    <div>
      {eintraege.map(({ t, p }) => {
        const ende = new Date(new Date(t.start).getTime() + t.dauerMin * 60000);
        return (
          <Link key={t.id} to={`/termine/${t.id}`} className={`agenda-item ${t.status}`}>
            <div className="timebox">
              {formatTime(t.start)}
              <small>{formatTime(ende.toISOString())}</small>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 650 }}>{patientName(p, 'vn')}</div>
              <div className="muted small">{t.ort}</div>
              {t.status === 'durchgefuehrt' && !t.doku?.inhalte && <div className="small" style={{ color: 'var(--warn)' }}>⚠ Doku fehlt</div>}
            </div>
            <Badge tone={TERMIN_STATUS[t.status].tone}>{TERMIN_STATUS[t.status].label}</Badge>
          </Link>
        );
      })}
    </div>
  );
}

function kw(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const tag = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - tag);
  const jahrStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - jahrStart.getTime()) / 86400000 + 1) / 7);
}
