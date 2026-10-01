import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { defaultEinstellungen } from '../db/defaults';
import type { Einstellungen, Kostentraeger, Patient, Rechnung, Rezept, Termin } from '../db/types';
import { werteRezeptAus, type RezeptAuswertung } from './status';

export function useEinstellungen(): Einstellungen {
  const e = useLiveQuery(() => db.einstellungen.get('main'), []);
  return e ? { ...defaultEinstellungen, ...e } : defaultEinstellungen;
}

export interface RezeptInfo {
  rezept: Rezept;
  patient?: Patient;
  kostentraeger?: Kostentraeger;
  termine: Termin[];
  rechnungen: Rechnung[];
  a: RezeptAuswertung;
}

/** Alle Rezepte mit berechnetem Status (optional gefiltert auf einen Patienten) */
export function useRezeptInfos(patientId?: string): RezeptInfo[] | undefined {
  return useLiveQuery(async () => {
    const [rezepte, termine, rechnungen, patienten, kts, e] = await Promise.all([
      patientId ? db.rezepte.where('patientId').equals(patientId).toArray() : db.rezepte.toArray(),
      patientId ? db.termine.where('patientId').equals(patientId).toArray() : db.termine.toArray(),
      patientId ? db.rechnungen.where('patientId').equals(patientId).toArray() : db.rechnungen.toArray(),
      db.patienten.toArray(),
      db.kostentraeger.toArray(),
      db.einstellungen.get('main'),
    ]);
    const einst = { ...defaultEinstellungen, ...e };
    const pMap = new Map(patienten.map((p) => [p.id, p]));
    const kMap = new Map(kts.map((k) => [k.id, k]));
    const jetzt = new Date();
    return rezepte.map((r) => {
      const ts = termine.filter((t) => t.rezeptId === r.id);
      const res = rechnungen.filter((x) => x.rezeptId === r.id);
      return {
        rezept: r,
        patient: pMap.get(r.patientId),
        kostentraeger: r.kostentraegerId ? kMap.get(r.kostentraegerId) : undefined,
        termine: ts,
        rechnungen: res,
        a: werteRezeptAus(r, ts, res, einst, jetzt),
      };
    });
  }, [patientId]);
}
