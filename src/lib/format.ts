// Formatierungs- und Datumshelfer (deutsche Schreibweise)

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export const formatEuro = (v: number) => eur.format(Number.isFinite(v) ? v : 0);

export const round2 = (v: number) => Math.round(v * 100) / 100;

/** YYYY-MM-DD des lokalen Datums */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DDTHH:mm" für <input type="datetime-local"> */
export function isoLocalDateTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${isoDate(d)}T${h}:${min}`;
}

export function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  // reine Datumsangaben als lokale Mitternacht interpretieren
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(s: string | undefined): string {
  const d = parseDate(s);
  return d ? d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
}

export function formatDateShort(s: string | undefined): string {
  const d = parseDate(s);
  return d ? d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '–';
}

export function formatTime(s: string | undefined): string {
  const d = parseDate(s);
  return d ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';
}

export function formatDateTime(s: string | undefined): string {
  const d = parseDate(s);
  return d ? `${formatDate(s)}, ${formatTime(s)} Uhr` : '–';
}

export function formatWeekday(d: Date, style: 'short' | 'long' = 'short'): string {
  return d.toLocaleDateString('de-DE', { weekday: style });
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addDaysIso(s: string, n: number): string {
  return isoDate(addDays(parseDate(s) ?? new Date(), n));
}

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** Montag der Woche */
export function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  const day = (r.getDay() + 6) % 7;
  return addDays(r, -day);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Ganze Tage von a bis b (b - a) */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

export function alter(geburtsdatum: string, heute = new Date()): number | null {
  const g = parseDate(geburtsdatum);
  if (!g) return null;
  let a = heute.getFullYear() - g.getFullYear();
  const m = heute.getMonth() - g.getMonth();
  if (m < 0 || (m === 0 && heute.getDate() < g.getDate())) a--;
  return a;
}

export function patientName(p: { vorname: string; nachname: string } | undefined, order: 'nv' | 'vn' = 'nv'): string {
  if (!p) return 'Unbekannt';
  return order === 'nv' ? `${p.nachname}, ${p.vorname}` : `${p.vorname} ${p.nachname}`;
}

export function formatIban(iban: string): string {
  return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/** IBAN-Prüfziffer nach ISO 13616 (Modulo 97) */
export function pruefeIban(iban: string): boolean {
  const s = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const umgestellt = s.slice(4) + s.slice(0, 4);
  const ziffern = umgestellt.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const z of ziffern) rest = (rest * 10 + Number(z)) % 97;
  return rest === 1;
}
