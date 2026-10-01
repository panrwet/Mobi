// CSV-Export (Semikolon-getrennt, deutsches Zahlenformat – öffnet direkt in Excel/LibreOffice)

const zelle = (v: unknown): string => {
  const s = typeof v === 'number' ? v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }) : String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function csvText(kopf: string[], zeilen: unknown[][]): string {
  return [kopf, ...zeilen].map((z) => z.map(zelle).join(';')).join('\r\n');
}

export function csvAusgeben(dateiname: string, kopf: string[], zeilen: unknown[][]) {
  // BOM, damit Excel die Umlaute korrekt erkennt
  const blob = new Blob(['﻿' + csvText(kopf, zeilen)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = dateiname;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
