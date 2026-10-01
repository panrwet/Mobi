// Datensicherung: alle Daten als Datei exportieren und wieder einspielen.
// Optional mit Passwort verschlüsselt (AES-GCM, Schlüssel per PBKDF2) – empfohlen, da Gesundheitsdaten.
import { db } from './db';

export const TABELLEN = ['patienten', 'rezepte', 'termine', 'rechnungen', 'dokumente', 'kostentraeger', 'aerzte', 'einstellungen'] as const;
type Tabelle = (typeof TABELLEN)[number];

interface Inhalt {
  app: 'mobi';
  version: number;
  exportiertAm: string;
  daten: Partial<Record<Tabelle, Record<string, unknown>[]>>;
}

interface VerschluesselteDatei {
  app: 'mobi';
  format: 'verschluesselt';
  version: 3;
  salt: string;
  iv: string;
  iterationen: number;
  daten: string;
}

const ITERATIONEN = 310_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function schluessel(passwort: string, salt: Uint8Array, iterationen: number) {
  const basis = await crypto.subtle.importKey('raw', enc.encode(passwort), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iterationen }, basis, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Exportiert alle Daten; mit Passwort verschlüsselt, ohne Passwort als lesbares JSON */
export async function exportiereSicherung(passwort: string): Promise<string> {
  const daten: Inhalt['daten'] = {};
  for (const t of TABELLEN) daten[t] = await db.table(t).toArray();
  const inhalt = JSON.stringify({ app: 'mobi', version: 3, exportiertAm: new Date().toISOString(), daten } satisfies Inhalt);
  if (!passwort) return inhalt;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await schluessel(passwort, salt, ITERATIONEN);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(inhalt)));
  const datei: VerschluesselteDatei = { app: 'mobi', format: 'verschluesselt', version: 3, salt: toB64(salt), iv: toB64(iv), iterationen: ITERATIONEN, daten: toB64(ct) };
  return JSON.stringify(datei);
}

export function brauchtPasswort(text: string): boolean {
  try {
    return JSON.parse(text)?.format === 'verschluesselt';
  } catch {
    return false;
  }
}

async function leseSicherung(text: string, passwort: string): Promise<Inhalt> {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine Mobi-Sicherung.');
  }
  let inhalt = roh as Inhalt;
  if ((roh as VerschluesselteDatei)?.format === 'verschluesselt') {
    const d = roh as VerschluesselteDatei;
    if (!d.iv) throw new Error('Diese Sicherung stammt aus einer älteren Testversion und kann nicht eingelesen werden.');
    try {
      const key = await schluessel(passwort, fromB64(d.salt), d.iterationen);
      const klar = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(d.iv) as BufferSource }, key, fromB64(d.daten) as BufferSource);
      inhalt = JSON.parse(dec.decode(klar));
    } catch {
      throw new Error('Falsches Passwort oder beschädigte Datei.');
    }
  }
  if (inhalt?.app !== 'mobi' || !inhalt.daten) throw new Error('Die Datei ist keine Mobi-Sicherung.');
  return inhalt;
}

/** Ersetzt alle lokalen Daten durch den Stand der Sicherung */
export async function sicherungEinspielen(text: string, passwort = '') {
  const inhalt = await leseSicherung(text, passwort);
  await db.transaction('rw', TABELLEN.map((t) => db.table(t)), async () => {
    for (const t of TABELLEN) {
      await db.table(t).clear();
      const rows = (inhalt.daten[t] ?? []).map((r) => (t === 'rechnungen' && !r.art ? { ...r, art: 'schluss' } : r));
      if (rows.length) await db.table(t).bulkPut(rows);
    }
  });
}

/** Datei teilen (Smartphone: Teilen-Menü) oder herunterladen */
export async function dateiAusgeben(inhalt: string, dateiname: string) {
  const datei = new File([inhalt], dateiname, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [datei] }) && window.matchMedia('(pointer: coarse)').matches) {
    try {
      await nav.share({ files: [datei], title: dateiname });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(datei);
  a.download = dateiname;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
