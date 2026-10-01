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

/**
 * Rechnungspositionen aus dem genehmigten KV und den tatsächlich geleisteten Terminen ableiten.
 * - "einheit": Menge = geleistete Einheiten (verteilt auf die Einheiten-Positionen in KV-Reihenfolge)
 * - "pauschal": unverändert aus dem KV
 * - "km": tatsächlich gefahrene Kilometer der durchgeführten Termine
 */
export function rechnungsPositionen(kvPositionen: Position[], termine: Termin[]): Position[] {
  const durchgefuehrt = termine.filter((t) => t.status === 'durchgefuehrt');
  let rest = durchgefuehrt.reduce((s, t) => s + (t.einheiten || 0), 0);
  const km = round2(durchgefuehrt.reduce((s, t) => s + (t.km || 0), 0));

  const einheitPos = kvPositionen.filter((p) => p.typ === 'einheit');
  const letzteEinheit = einheitPos[einheitPos.length - 1];

  const result: Position[] = [];
  for (const p of kvPositionen) {
    if (p.typ === 'einheit') {
      const menge = p === letzteEinheit ? rest : Math.min(rest, p.menge);
      rest -= menge;
      if (menge > 0) result.push({ ...p, menge });
    } else if (p.typ === 'km') {
      if (km > 0) result.push({ ...p, menge: km });
    } else {
      result.push({ ...p });
    }
  }
  return result;
}

export function formatNummer(praefix: string, jahr: number, laufend: number): string {
  return `${praefix}${jahr}-${String(laufend).padStart(4, '0')}`;
}
