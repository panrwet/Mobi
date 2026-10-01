// Berechnungen für Kostenvoranschlag und Rechnung (reine Funktionen)
import type { Patient, Position, Termin } from '../db/types';
import { round2 } from './format';

export const positionBetrag = (p: Position) => round2(p.menge * p.einzelpreis);

export const summePositionen = (ps: Position[]) => round2(ps.reduce((s, p) => s + positionBetrag(p), 0));

/**
 * Gesetzliche Zuzahlung (§ 61 SGB V): 10 % der Kosten, mindestens 5 €, höchstens 10 €,
 * jedoch nie mehr als die Kosten selbst. Entfällt bei Befreiung.
 */
export function berechneZuzahlung(summe: number, patient: Pick<Patient, 'versicherung'>, aktiv: boolean, stichtag: string): number {
  if (!aktiv || summe <= 0) return 0;
  const v = patient.versicherung;
  if (v.zuzahlungsbefreit && (!v.befreitBis || v.befreitBis >= stichtag)) return 0;
  return round2(Math.min(summe, Math.min(10, Math.max(5, summe * 0.1))));
}

/** Pauschalen ohne Angabe: Abschlussberichte am Ende, alles andere zu Beginn abrechnen */
export const zeitpunktVon = (p: Position): 'beginn' | 'ende' =>
  p.zeitpunkt ?? (p.leistungId === 'l-bericht' || /abschluss/i.test(p.bezeichnung) ? 'ende' : 'beginn');

const schluessel = (p: Position) => p.leistungId ?? p.bezeichnung;

/**
 * Rechnungspositionen aus dem genehmigten KV und den noch nicht abgerechneten, geleisteten Terminen.
 * - "einheit": geleistete Einheiten (verteilt auf die Einheiten-Positionen in KV-Reihenfolge,
 *   abzüglich bereits mit Teilrechnungen abgerechneter Mengen)
 * - "pauschal": einmalig – "beginn" mit der ersten Rechnung, "ende" erst mit der Schlussrechnung
 * - "km": gefahrene Kilometer der abzurechnenden Termine
 */
export function rechnungsPositionen(
  kvPositionen: Position[],
  termine: Termin[],
  frueher: Position[] = [],
  art: 'teil' | 'schluss' = 'schluss',
): Position[] {
  const offen = termine.filter((t) => t.status === 'durchgefuehrt' && !t.rechnungId);
  let rest = offen.reduce((s, t) => s + (t.einheiten || 0), 0);
  const km = round2(offen.reduce((s, t) => s + (t.km || 0), 0));

  const schonAbgerechnet = new Map<string, number>();
  for (const p of frueher) schonAbgerechnet.set(schluessel(p), (schonAbgerechnet.get(schluessel(p)) ?? 0) + p.menge);

  const einheitPos = kvPositionen.filter((p) => p.typ === 'einheit');
  const letzteEinheit = einheitPos[einheitPos.length - 1];

  const result: Position[] = [];
  for (const p of kvPositionen) {
    if (p.typ === 'einheit') {
      const frei = Math.max(0, p.menge - (schonAbgerechnet.get(schluessel(p)) ?? 0));
      const menge = p === letzteEinheit ? rest : Math.min(rest, frei);
      rest -= menge;
      if (menge > 0) result.push({ ...p, menge });
    } else if (p.typ === 'km') {
      if (km > 0) result.push({ ...p, menge: km });
    } else if (!schonAbgerechnet.has(schluessel(p)) && (zeitpunktVon(p) === 'beginn' || art === 'schluss')) {
      result.push({ ...p });
    }
  }
  return result;
}

export function formatNummer(praefix: string, jahr: number, laufend: number): string {
  return `${praefix}${jahr}-${String(laufend).padStart(4, '0')}`;
}
