import Dexie, { type Table } from 'dexie';
import type { Arzt, Dokument, Einstellungen, Kostentraeger, Patient, Rechnung, Rezept, Termin } from './types';

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
    this.version(2).stores({
      patienten: 'id',
      dokumente: 'id, patientId, rezeptId',
      meta: 'id',
      geloescht: 'id, tabelle',
    });
    // v3: PIN-Verschlüsselung und Geräte-Abgleich entfernt. Verschlüsselte Testdaten aus v2
    // sind ohne Schlüssel nicht lesbar – dann wird neu begonnen (Beispieldaten werden neu geladen).
    this.version(3)
      .stores({ meta: null, geloescht: null })
      .upgrade(async (tx) => {
        const verschluesselt = (await tx.table('patienten').limit(1).toArray()).some((p) => '_enc' in p);
        if (!verschluesselt) return;
        for (const t of ['patienten', 'rezepte', 'termine', 'rechnungen', 'dokumente', 'einstellungen']) await tx.table(t).clear();
      });
  }
}

export const db = new MobiDB();

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
