// Serienplanung von Terminen (rein, testbar)
import type { Termin } from '../db/types';
import { addDays, parseDate } from './format';

export interface SerienParameter {
  startDatum: string; // YYYY-MM-DD
  uhrzeit: string; // HH:mm
  wochentage: number[]; // 1 = Montag … 7 = Sonntag
  anzahl: number;
  dauerMin: number;
}

/** Liefert die Startzeitpunkte der Serie (lokale Zeit) */
export function serienTermine(p: SerienParameter): Date[] {
  const start = parseDate(p.startDatum);
  if (!start || p.anzahl <= 0 || p.wochentage.length === 0) return [];
  const [h, m] = p.uhrzeit.split(':').map(Number);
  const res: Date[] = [];
  for (let i = 0; res.length < p.anzahl && i < 366 * 2; i++) {
    const d = addDays(start, i);
    const wd = ((d.getDay() + 6) % 7) + 1;
    if (!p.wochentage.includes(wd)) continue;
    d.setHours(h || 0, m || 0, 0, 0);
    res.push(d);
  }
  return res;
}

/** Überschneidet sich ein Zeitraum mit bestehenden (nicht abgesagten) Terminen? */
export function konflikte(start: Date, dauerMin: number, termine: Pick<Termin, 'id' | 'start' | 'dauerMin' | 'status'>[], ausserId?: string) {
  const a0 = start.getTime();
  const a1 = a0 + dauerMin * 60000;
  return termine.filter((t) => {
    if (t.id === ausserId || t.status === 'abgesagt_patient' || t.status === 'abgesagt_praxis') return false;
    const b0 = new Date(t.start).getTime();
    const b1 = b0 + t.dauerMin * 60000;
    return a0 < b1 && b0 < a1;
  });
}
