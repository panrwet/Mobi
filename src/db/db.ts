import Dexie, { type Table } from 'dexie';
import type { Arzt, Einstellungen, Kostentraeger, Patient, Rechnung, Rezept, Termin } from './types';

// Lokale Datenbank im Browser (IndexedDB). Es werden keine Daten an einen Server übertragen.
export class MobiDB extends Dexie {
  patienten!: Table<Patient, string>;
  rezepte!: Table<Rezept, string>;
  termine!: Table<Termin, string>;
  rechnungen!: Table<Rechnung, string>;
  kostentraeger!: Table<Kostentraeger, string>;
  aerzte!: Table<Arzt, string>;
  einstellungen!: Table<Einstellungen, string>;

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
  }
}

export const db = new MobiDB();

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
