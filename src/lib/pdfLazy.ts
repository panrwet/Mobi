// jsPDF ist groß – das PDF-Modul wird daher erst bei Bedarf (bzw. im Leerlauf vorab) geladen.
type PdfModul = typeof import('./pdf');

let modul: Promise<PdfModul> | null = null;
export const ladePdfModul = () => (modul ??= import('./pdf'));

/** Erzeugt ein PDF mit dem übergebenen Generator und zeigt es an */
export async function pdf(erzeuge: (m: PdfModul) => import('jspdf').jsPDF, dateiname: string) {
  const m = await ladePdfModul();
  m.zeigePdf(erzeuge(m), dateiname);
}
