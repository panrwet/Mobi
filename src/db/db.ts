import Dexie, { type DBCore, type DBCoreCursor, type DBCoreTable, type Middleware, type Table } from 'dexie';
import type { Arzt, Dokument, Einstellungen, Geloescht, Kostentraeger, Meta, Patient, Rechnung, Rezept, Termin } from './types';
import { entschluesselnJson, sitzungsschluessel, verschluesselnJson } from './krypto';

// Lokale Datenbank im Browser (IndexedDB). Es werden keine Daten an einen Server übertragen.
export class MobiDB extends Dexie {
  patienten!: Table<Patient, string>;
  rezepte!: Table<Rezept, string>;
  termine!: Table<Termin, string>;
  rechnungen!: Table<Rechnung, string>;
  kostentraeger!: Table<Kostentraeger, string>;
  aerzte!: Table<Arzt, string>;
  einstellungen!: Table<Einstellungen, string>;
  dokumente!: Table<Dokument, string>;
  meta!: Table<Meta, string>;
  geloescht!: Table<Geloescht, string>;

  constructor() {
    super('mobi');
    this.version(1).stores({
      patienten: 'id, nachname, archiviert',
      rezepte: 'id, patientId, nummer',
      termine: 'id, rezeptId, patientId, start, status',
      rechnungen: 'id, rezeptId, patientId, nummer, status',
      kostentraeger: 'id, name',
      aerzte: 'id, name',
      einstellungen: 'id',
    });
    // v2: Namen nicht mehr als (unverschlüsselten) Index, neue Tabellen
    this.version(2).stores({
      patienten: 'id',
      dokumente: 'id, patientId, rezeptId',
      meta: 'id',
      geloescht: 'id, tabelle',
    });
    this.use(verschluesselungsMiddleware);
  }
}

/** Tabellen mit Gesundheits-/Patientendaten werden verschlüsselt gespeichert */
export const VERSCHLUESSELT = new Set(['patienten', 'rezepte', 'termine', 'rechnungen', 'dokumente']);
/** Tabellen, die beim Geräte-Abgleich übertragen werden */
export const ABGLEICH_TABELLEN = ['patienten', 'rezepte', 'termine', 'rechnungen', 'dokumente', 'kostentraeger', 'aerzte', 'einstellungen'] as const;

/** Während eines Abgleichs dürfen die Zeitstempel der Gegenseite nicht überschrieben werden */
let stempelAktiv = true;
export async function ohneStempel<T>(fn: () => Promise<T>): Promise<T> {
  stempelAktiv = false;
  try {
    return await fn();
  } finally {
    stempelAktiv = true;
  }
}

export class GesperrtError extends Error {
  constructor() {
    super('Die Daten sind gesperrt – bitte zuerst mit PIN entsperren.');
  }
}

/**
 * Dexie-Middleware: verschlüsselt jeden Datensatz der sensiblen Tabellen.
 * Im Klartext bleiben nur Primärschlüssel und Indexfelder (IDs, Terminbeginn, Status),
 * alles andere steht verschlüsselt im Feld `_enc`.
 */
const verschluesselungsMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'verschluesselung',
  level: 0,
  create(down) {
    return {
      ...down,
      table(name) {
        const t = down.table(name);
        const abgleich = (ABGLEICH_TABELLEN as readonly string[]).includes(name);
        if (!VERSCHLUESSELT.has(name) && !abgleich) return t;
        const verschluesseln = VERSCHLUESSELT.has(name);
        const felder = [t.schema.primaryKey.keyPath, ...t.schema.indexes.map((i) => i.keyPath)].filter((k): k is string => typeof k === 'string');

        const ein = (v: Record<string, unknown>) => {
          const wert = abgleich && stempelAktiv ? { ...v, geaendertAm: new Date().toISOString() } : v;
          if (!verschluesseln) return wert;
          const key = sitzungsschluessel();
          if (!key) throw new GesperrtError();
          const gespeichert: Record<string, unknown> = { _enc: verschluesselnJson(key, wert) };
          for (const f of felder) if (wert[f] !== undefined) gespeichert[f] = wert[f];
          return gespeichert;
        };
        const aus = (v: unknown) => {
          if (!verschluesseln || !v || typeof v !== 'object' || !('_enc' in v)) return v;
          const key = sitzungsschluessel();
          if (!key) throw new GesperrtError();
          return entschluesselnJson(key, (v as { _enc: string })._enc);
        };
        const cursor = (c: DBCoreCursor | null): DBCoreCursor | null => {
          if (!c || !verschluesseln) return c;
          let rohLetzter: unknown;
          let wertLetzter: unknown;
          return Object.create(c, {
            value: {
              get() {
                const roh = c.value;
                if (roh !== rohLetzter) {
                  rohLetzter = roh;
                  wertLetzter = aus(roh);
                }
                return wertLetzter;
              },
            },
          });
        };

        const tabelle: DBCoreTable = {
          ...t,
          mutate(req) {
            if (req.type === 'add' || req.type === 'put') {
              return t.mutate({ ...req, values: req.values.map((v) => ein(v as Record<string, unknown>)) });
            }
            return t.mutate(req);
          },
          get: (req) => t.get(req).then(aus),
          getMany: (req) => t.getMany(req).then((vs) => vs.map(aus)),
          query: (req) => t.query(req).then((res) => (req.values ? { ...res, result: res.result.map(aus) } : res)),
          openCursor: (req) => t.openCursor(req).then(cursor),
        };
        return tabelle;
      },
    };
  },
};

export const db = new MobiDB();

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Löscht einen Datensatz und hinterlegt einen Löschvermerk für den Geräte-Abgleich */
export async function loeschen(tabelle: (typeof ABGLEICH_TABELLEN)[number], id: string) {
  await db.transaction('rw', db.table(tabelle), db.geloescht, async () => {
    await db.table(tabelle).delete(id);
    await db.geloescht.put({ id: `${tabelle}:${id}`, tabelle, schluessel: id, am: new Date().toISOString() });
  });
}
