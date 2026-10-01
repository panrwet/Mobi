// PIN-Schutz: Einrichten, Entsperren, PIN ändern, Sperren
import { db, VERSCHLUESSELT } from './db';
import {
  entschluesseln,
  fromB64,
  PBKDF2_ITERATIONEN,
  schluesselAusPasswort,
  setzeSitzungsschluessel,
  toB64,
  verschluesseln,
  zufall,
} from './krypto';
import type { Meta } from './types';

type KryptoMeta = Extract<Meta, { id: 'krypto' }>;

export const MIN_PIN_LAENGE = 6;

export async function schutzEingerichtet(): Promise<boolean> {
  return !!(await db.meta.get('krypto'));
}

async function verpacke(pin: string, dek: Uint8Array): Promise<KryptoMeta> {
  const salt = zufall(16);
  const kek = await schluesselAusPasswort(pin, salt);
  return { id: 'krypto', salt: toB64(salt), iterationen: PBKDF2_ITERATIONEN, dekVerpackt: toB64(verschluesseln(kek, dek)), erstelltAm: new Date().toISOString() };
}

/** Ersteinrichtung: erzeugt den Datenschlüssel und verschlüsselt vorhandene (Alt-)Daten */
export async function schutzEinrichten(pin: string) {
  if (pin.length < MIN_PIN_LAENGE) throw new Error(`Die PIN muss mindestens ${MIN_PIN_LAENGE} Stellen haben.`);
  if (await schutzEingerichtet()) throw new Error('Schutz ist bereits eingerichtet.');
  const dek = zufall(32);
  const meta = await verpacke(pin, dek);
  // Alt-Daten (unverschlüsselt, aus Version 1) einlesen, bevor der Schlüssel aktiv ist
  const tabellen = [...VERSCHLUESSELT];
  const alt: Record<string, unknown[]> = {};
  for (const t of tabellen) alt[t] = await db.table(t).toArray();
  setzeSitzungsschluessel(dek);
  await db.transaction('rw', [...tabellen.map((t) => db.table(t)), db.meta], async () => {
    for (const t of tabellen) if (alt[t].length) await db.table(t).bulkPut(alt[t]);
    await db.meta.put(meta);
  });
}

/** Entsperren: wirft bei falscher PIN */
export async function entsperren(pin: string) {
  const meta = (await db.meta.get('krypto')) as KryptoMeta | undefined;
  if (!meta) throw new Error('Kein Schutz eingerichtet.');
  const kek = await schluesselAusPasswort(pin, fromB64(meta.salt), meta.iterationen);
  let dek: Uint8Array;
  try {
    dek = entschluesseln(kek, fromB64(meta.dekVerpackt));
  } catch {
    throw new Error('Falsche PIN');
  }
  setzeSitzungsschluessel(dek);
}

export async function pinAendern(altePin: string, neuePin: string) {
  if (neuePin.length < MIN_PIN_LAENGE) throw new Error(`Die neue PIN muss mindestens ${MIN_PIN_LAENGE} Stellen haben.`);
  const meta = (await db.meta.get('krypto')) as KryptoMeta | undefined;
  if (!meta) throw new Error('Kein Schutz eingerichtet.');
  const kek = await schluesselAusPasswort(altePin, fromB64(meta.salt), meta.iterationen);
  let dek: Uint8Array;
  try {
    dek = entschluesseln(kek, fromB64(meta.dekVerpackt));
  } catch {
    throw new Error('Die bisherige PIN ist falsch.');
  }
  // Nur der Datenschlüssel wird neu verpackt – die Daten selbst bleiben unverändert
  await db.meta.put(await verpacke(neuePin, dek));
}

/** Sperren: Schlüssel verwerfen und App neu laden (leert auch den Arbeitsspeicher) */
export function sperren() {
  setzeSitzungsschluessel(null);
  window.location.reload();
}

/** PIN vergessen: alle Daten unwiderruflich löschen */
export async function allesZuruecksetzen() {
  db.close();
  await db.delete();
  window.location.reload();
}

// ---------- Fehlversuche (gegen Durchprobieren der PIN) ----------

const FEHL_KEY = 'mobi-fehlversuche';

export function fehlversuche(): { anzahl: number; gesperrtBis: number } {
  try {
    return JSON.parse(localStorage.getItem(FEHL_KEY) ?? '') as { anzahl: number; gesperrtBis: number };
  } catch {
    return { anzahl: 0, gesperrtBis: 0 };
  }
}

export function fehlversuchMerken() {
  const f = fehlversuche();
  const anzahl = f.anzahl + 1;
  // ab dem 5. Fehlversuch wachsende Wartezeit: 30 s, 60 s, 120 s …
  const warte = anzahl >= 5 ? 30_000 * 2 ** (anzahl - 5) : 0;
  try {
    localStorage.setItem(FEHL_KEY, JSON.stringify({ anzahl, gesperrtBis: Date.now() + warte }));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

export function fehlversucheZuruecksetzen() {
  try {
    localStorage.removeItem(FEHL_KEY);
  } catch {
    /* Speicher nicht verfügbar */
  }
}
