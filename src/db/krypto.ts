// Verschlüsselung der lokalen Daten.
//
// Aufbau (Envelope-Verschlüsselung):
//  - Ein zufälliger 256-Bit-Datenschlüssel (DEK) verschlüsselt alle Datensätze (XChaCha20-Poly1305).
//  - Der DEK wird mit einem aus der PIN abgeleiteten Schlüssel (PBKDF2-SHA-256) verpackt und so gespeichert.
//  - Nach dem Entsperren liegt der DEK nur im Arbeitsspeicher; Sperren = Seite neu laden.
// Die Ver-/Entschlüsselung läuft synchron, damit sie in der Dexie-Middleware (auch in Cursorn) nutzbar ist.
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

export const PBKDF2_ITERATIONEN = 310_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function zufall(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function toB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

export function verschluesseln(key: Uint8Array, daten: Uint8Array): Uint8Array {
  const nonce = zufall(24);
  const ct = xchacha20poly1305(key, nonce).encrypt(daten);
  const out = new Uint8Array(24 + ct.length);
  out.set(nonce);
  out.set(ct, 24);
  return out;
}

export function entschluesseln(key: Uint8Array, daten: Uint8Array): Uint8Array {
  return xchacha20poly1305(key, daten.subarray(0, 24)).decrypt(daten.subarray(24));
}

export const verschluesselnJson = (key: Uint8Array, wert: unknown) => toB64(verschluesseln(key, enc.encode(JSON.stringify(wert))));
export const entschluesselnJson = <T = unknown>(key: Uint8Array, b64: string): T => JSON.parse(dec.decode(entschluesseln(key, fromB64(b64))));

export async function schluesselAusPasswort(passwort: string, salt: Uint8Array, iterationen = PBKDF2_ITERATIONEN): Promise<Uint8Array> {
  const basis = await crypto.subtle.importKey('raw', enc.encode(passwort), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iterationen }, basis, 256);
  return new Uint8Array(bits);
}

// ---------- Sitzungsschlüssel ----------

let dek: Uint8Array | null = null;
export const setzeSitzungsschluessel = (k: Uint8Array | null) => {
  dek = k;
};
export const sitzungsschluessel = () => dek;
export const istEntsperrt = () => dek !== null;

// ---------- Passwortgeschützte Dateien (Sicherung / Geräte-Abgleich) ----------

export interface VerschluesselteDatei {
  app: 'mobi';
  format: 'verschluesselt';
  version: 2;
  salt: string;
  iterationen: number;
  daten: string;
}

export async function dateiVerschluesseln(passwort: string, inhalt: string): Promise<string> {
  const salt = zufall(16);
  const key = await schluesselAusPasswort(passwort, salt);
  const datei: VerschluesselteDatei = {
    app: 'mobi',
    format: 'verschluesselt',
    version: 2,
    salt: toB64(salt),
    iterationen: PBKDF2_ITERATIONEN,
    daten: toB64(verschluesseln(key, enc.encode(inhalt))),
  };
  return JSON.stringify(datei);
}

export function istVerschluesselteDatei(x: unknown): x is VerschluesselteDatei {
  return !!x && typeof x === 'object' && (x as VerschluesselteDatei).format === 'verschluesselt';
}

export async function dateiEntschluesseln(passwort: string, datei: VerschluesselteDatei): Promise<string> {
  const key = await schluesselAusPasswort(passwort, fromB64(datei.salt), datei.iterationen);
  try {
    return dec.decode(entschluesseln(key, fromB64(datei.daten)));
  } catch {
    throw new Error('Falsches Passwort oder beschädigte Datei');
  }
}
