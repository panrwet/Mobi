import { describe, expect, it } from 'vitest';
import type { Patient, Position, Rechnung, Rezept, Termin } from '../db/types';
import { berechneZuzahlung, rechnungsPositionen, summePositionen } from '../lib/abrechnung';
import { pruefeIban } from '../lib/format';
import { konflikte, serienTermine } from '../lib/planung';
import { werteRezeptAus } from '../lib/status';

const e = { kvWiedervorlageTage: 14, verordnungGueltigTage: 28 };
const jetzt = new Date('2026-10-01T12:00:00');

const rezept = (kv?: Partial<NonNullable<Rezept['kv']>>): Rezept => ({
  id: 'r',
  nummer: 'VO-1',
  patientId: 'p',
  arztId: '',
  kostentraegerId: '',
  leistungsart: 'O&M',
  ausstellungsdatum: '2026-09-20',
  eingangsdatum: '2026-09-20',
  diagnose: 'x',
  icd10: '',
  verordnung: '',
  verordneteEinheiten: 4,
  verlauf: [],
  erstelltAm: '',
  kv: kv ? { nummer: 'KV-1', datum: '2026-09-21', positionen: [], begruendung: '', ziele: '', status: 'entwurf', ...kv } : undefined,
});

const termin = (i: number, status: Termin['status'], doku = true, start = `2026-09-${10 + i}T10:00:00`): Termin => ({
  id: `t${i}`,
  rezeptId: 'r',
  patientId: 'p',
  start: new Date(start).toISOString(),
  dauerMin: 60,
  einheiten: 1,
  ort: '',
  status,
  km: 10,
  doku: doku ? { inhalte: 'x', verlauf: '', naechsteSchritte: '', erstelltAm: '' } : undefined,
});

describe('Rezept-Status', () => {
  it('neu ohne KV', () => {
    expect(werteRezeptAus(rezept(), [], [], e, jetzt).phase).toBe('neu');
  });
  it('KV versendet mit Wiedervorlage-Hinweis', () => {
    const a = werteRezeptAus(rezept({ status: 'versendet', versendetAm: '2026-09-10' }), [], [], e, jetzt);
    expect(a.phase).toBe('kv_versendet');
    expect(a.warnungen.some((w) => w.text.includes('ohne Antwort'))).toBe(true);
  });
  it('genehmigt → verplant → in Behandlung → doku offen → abrechenbar', () => {
    const kv = rezept({ status: 'genehmigt', genehmigteEinheiten: 3 });
    expect(werteRezeptAus(kv, [], [], e, jetzt).phase).toBe('genehmigt');
    const zukunft = (i: number) => termin(i, 'geplant', false, `2026-10-0${2 + i}T10:00:00`);
    expect(werteRezeptAus(kv, [zukunft(1), zukunft(2), zukunft(3)], [], e, jetzt).phase).toBe('termine_verplant');
    expect(werteRezeptAus(kv, [termin(1, 'durchgefuehrt'), zukunft(2)], [], e, jetzt).phase).toBe('in_behandlung');
    const alle = [termin(1, 'durchgefuehrt'), termin(2, 'durchgefuehrt', false), termin(3, 'durchgefuehrt')];
    expect(werteRezeptAus(kv, alle, [], e, jetzt).phase).toBe('doku_offen');
    alle[1] = termin(2, 'durchgefuehrt');
    expect(werteRezeptAus(kv, alle, [], e, jetzt).phase).toBe('abrechenbar');
  });
  it('abgesagte Termine zählen nicht als geleistet', () => {
    const kv = rezept({ status: 'genehmigt', genehmigteEinheiten: 2 });
    const a = werteRezeptAus(kv, [termin(1, 'durchgefuehrt'), termin(2, 'abgesagt_patient')], [], e, jetzt);
    expect(a.geleistetEinheiten).toBe(1);
  });
  it('vergangener geplanter Termin erzeugt Hinweis', () => {
    const a = werteRezeptAus(rezept({ status: 'genehmigt', genehmigteEinheiten: 3 }), [termin(1, 'geplant', false)], [], e, jetzt);
    expect(a.vergangeneOhneStatus).toBe(1);
  });
  it('Rechnung offen / bezahlt / storniert', () => {
    const kv = rezept({ status: 'genehmigt', genehmigteEinheiten: 1 });
    const re = (status: Rechnung['status']) => ({ id: 'x', rezeptId: 'r', status, faelligAm: '2026-09-01', nummer: 'RE-1' }) as Rechnung;
    const offen = werteRezeptAus(kv, [termin(1, 'durchgefuehrt')], [re('offen')], e, jetzt);
    expect(offen.phase).toBe('abgerechnet');
    expect(offen.warnungen.some((w) => w.text.includes('überfällig'))).toBe(true);
    expect(werteRezeptAus(kv, [termin(1, 'durchgefuehrt')], [re('bezahlt')], e, jetzt).phase).toBe('abgeschlossen');
    expect(werteRezeptAus(kv, [termin(1, 'durchgefuehrt')], [re('storniert')], e, jetzt).phase).toBe('abrechenbar');
  });
  it('alte Verordnung ohne Behandlungsbeginn', () => {
    const r = { ...rezept(), ausstellungsdatum: '2026-08-01' };
    expect(werteRezeptAus(r, [], [], e, jetzt).warnungen[0].text).toContain('Gültigkeit');
  });
});

describe('Abrechnung', () => {
  const pos = (typ: Position['typ'], menge: number, preis: number): Position => ({ typ, bezeichnung: typ, menge, einheit: '', einzelpreis: preis });
  it('Rechnungspositionen aus geleisteten Einheiten und km', () => {
    const kv = [pos('pauschal', 1, 90), pos('einheit', 10, 75), pos('km', 100, 0.3)];
    const ts = [termin(1, 'durchgefuehrt'), termin(2, 'durchgefuehrt'), termin(3, 'abgesagt_patient')];
    const re = rechnungsPositionen(kv, ts);
    expect(re.map((p) => p.menge)).toEqual([1, 2, 20]);
    expect(summePositionen(re)).toBe(90 + 150 + 6);
  });
  it('Zuzahlung 10 %, min 5, max 10, Befreiung', () => {
    const p = { versicherung: { kostentraegerId: '', versichertennummer: '', status: '', zuzahlungsbefreit: false } } as Pick<Patient, 'versicherung'>;
    expect(berechneZuzahlung(30, p, true, '2026-10-01')).toBe(5);
    expect(berechneZuzahlung(80, p, true, '2026-10-01')).toBe(8);
    expect(berechneZuzahlung(900, p, true, '2026-10-01')).toBe(10);
    expect(berechneZuzahlung(900, p, false, '2026-10-01')).toBe(0);
    const befreit = { versicherung: { ...p.versicherung, zuzahlungsbefreit: true, befreitBis: '2026-12-31' } };
    expect(berechneZuzahlung(900, befreit, true, '2026-10-01')).toBe(0);
    expect(berechneZuzahlung(900, befreit, true, '2027-01-05')).toBe(10);
  });
});

describe('Planung & Hilfsfunktionen', () => {
  it('Serie an Wochentagen', () => {
    const d = serienTermine({ startDatum: '2026-10-01', uhrzeit: '09:30', wochentage: [1, 4], anzahl: 4, dauerMin: 60 });
    expect(d.map((x) => x.getDay())).toEqual([4, 1, 4, 1]);
    expect(d[0].getHours()).toBe(9);
    expect(d[0].getMinutes()).toBe(30);
  });
  it('Konflikterkennung', () => {
    const t = [termin(1, 'geplant', false, '2026-10-05T10:00:00')];
    expect(konflikte(new Date('2026-10-05T10:30:00'), 60, t)).toHaveLength(1);
    expect(konflikte(new Date('2026-10-05T11:00:00'), 60, t)).toHaveLength(0);
  });
  it('IBAN-Prüfung', () => {
    expect(pruefeIban('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(pruefeIban('DE89370400440532013001')).toBe(false);
  });
});
