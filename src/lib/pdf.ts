// PDF-Erzeugung für Kostenvoranschlag, Rechnung und Leistungsnachweis/Dokumentation (DIN-5008-ähnliches Layout)
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Adresse, Arzt, Bericht, Einstellungen, Kostentraeger, Patient, Position, Rechnung, Rezept, Termin } from '../db/types';
import { positionBetrag, summePositionen } from './abrechnung';
import { addDaysIso, formatDate, formatEuro, formatIban, formatTime, isoDate } from './format';
import { TERMIN_STATUS } from './status';

const RAND = 20;
const BREITE = 210;

/** Standardschrift (WinAnsi) kennt nicht alle Unicode-Zeichen – diese ersetzen */
const t = (s: string | undefined | null): string =>
  (s ?? '')
    .replace(/ı/g, 'i')
    .replace(/[„“”]/g, '"')
    .replace(/[‚‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[^\x0A\x20-\x7E\xA0-\xFF€]/g, '');

const adresseZeilen = (name: string, a: Adresse, zusatz?: string) =>
  [name, zusatz, a.strasse, `${a.plz} ${a.ort}`.trim()].filter((x): x is string => !!x && !!x.trim());

interface Kopf {
  titel: string;
  empfaenger: string[];
  infos: [string, string][];
}

function briefkopf(doc: jsPDF, e: Einstellungen, k: Kopf): number {
  // Absender oben rechts
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(15, 92, 110);
  doc.text(t(e.praxisname || e.name), BREITE - RAND, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(80);
  const absender = [e.name + (e.berufsbezeichnung ? ' · ' + e.berufsbezeichnung : ''), `${e.adresse.strasse} · ${e.adresse.plz} ${e.adresse.ort}`, [e.telefon && 'Tel. ' + e.telefon, e.email].filter(Boolean).join(' · '), e.ik ? 'IK ' + e.ik : ''].filter(Boolean);
  absender.forEach((z, i) => doc.text(t(z), BREITE - RAND, 23 + i * 4, { align: 'right' }));

  // Rücksendezeile + Empfänger (Fensterposition)
  doc.setFontSize(7).setTextColor(110);
  doc.text(t(`${e.name} · ${e.adresse.strasse} · ${e.adresse.plz} ${e.adresse.ort}`), RAND, 50);
  doc.setDrawColor(180).line(RAND, 51, RAND + 85, 51);
  doc.setFontSize(10.5).setTextColor(20);
  k.empfaenger.forEach((z, i) => doc.text(t(z), RAND, 57 + i * 5));

  // Infoblock rechts
  doc.setFontSize(9);
  k.infos.forEach(([l, v], i) => {
    doc.setTextColor(100).text(t(l), 125, 57 + i * 4.8);
    doc.setTextColor(20).text(t(v), BREITE - RAND, 57 + i * 4.8, { align: 'right' });
  });

  const y = Math.max(57 + k.empfaenger.length * 5, 57 + k.infos.length * 4.8) + 9;
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(20);
  doc.text(t(k.titel), RAND, y);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  return y + 8;
}

function fusszeile(doc: jsPDF, e: Einstellungen) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(200).line(RAND, 278, BREITE - RAND, 278);
    doc.setFontSize(7.5).setTextColor(110);
    doc.text(t(`${e.kontoinhaber} · ${e.bank} · IBAN ${formatIban(e.iban)} · BIC ${e.bic}`), RAND, 283);
    doc.text(t(`Steuernummer ${e.steuernummer}${e.ik ? ' · IK ' + e.ik : ''}`), RAND, 287);
    doc.text(`Seite ${i} von ${n}`, BREITE - RAND, 287, { align: 'right' });
  }
}

function absatz(doc: jsPDF, text: string, y: number, opts: { titel?: string; breite?: number } = {}): number {
  doc.setFontSize(9.5).setTextColor(20);
  if (opts.titel) {
    doc.setFont('helvetica', 'bold').text(t(opts.titel), RAND, y);
    doc.setFont('helvetica', 'normal');
    y += 4.5;
  }
  const zeilen: string[] = doc.splitTextToSize(t(text), opts.breite ?? BREITE - 2 * RAND);
  // kurze Absätze (z. B. Grußformel) nicht über Seiten trennen
  if (zeilen.length <= 8 && y + zeilen.length * 4.3 > 270) {
    doc.addPage();
    y = 25;
  }
  for (const z of zeilen) {
    if (y > 270) {
      doc.addPage();
      y = 25;
    }
    doc.text(z, RAND, y);
    y += 4.3;
  }
  return y + 2;
}

function positionsTabelle(doc: jsPDF, y: number, positionen: Position[], summenZeilen: [string, string][]): number {
  autoTable(doc, {
    startY: y,
    margin: { left: RAND, right: RAND, top: 20, bottom: 25 },
    head: [['Pos.', 'Nr.', 'Leistung', 'Menge', 'Einzelpreis', 'Betrag']],
    body: positionen.map((p, i) => [
      String(i + 1),
      t(p.positionsnummer ?? ''),
      t(p.bezeichnung),
      `${p.menge.toLocaleString('de-DE')} ${t(p.einheit)}`,
      formatEuro(p.einzelpreis),
      formatEuro(positionBetrag(p)),
    ]),
    foot: summenZeilen.map(([l, v]) => [{ content: t(l), colSpan: 5, styles: { halign: 'right' } }, { content: t(v), styles: { halign: 'right' } }]),
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.6 },
    headStyles: { fillColor: [15, 92, 110], textColor: 255 },
    footStyles: { fillColor: [235, 241, 243], textColor: 20, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 11 },
      1: { cellWidth: 18 },
      3: { halign: 'right', cellWidth: 22 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 24 },
    },
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
}

const arztName = (a?: Arzt) => (a ? [a.titel, a.name].filter(Boolean).join(' ') : '–');

export function kvPdf(r: Rezept, p: Patient, e: Einstellungen, kt?: Kostentraeger, arzt?: Arzt): jsPDF {
  const kv = r.kv!;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = briefkopf(doc, e, {
    titel: 'Kostenvoranschlag',
    empfaenger: kt ? adresseZeilen(kt.name, kt.adresse, kt.typ === 'GKV' ? 'Abteilung Hilfsmittel' : undefined) : adresseZeilen(`${p.vorname} ${p.nachname}`, p.adresse),
    infos: [
      ['KV-Nummer', kv.nummer],
      ['Datum', formatDate(kv.datum)],
      ['Unser IK', e.ik],
      ['Kostenträger-IK', kt?.ik || '–'],
    ],
  });

  autoTable(doc, {
    startY: y,
    margin: { left: RAND, right: RAND, top: 20, bottom: 25 },
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
    body: [
      ['Versicherte/r', t(`${p.vorname} ${p.nachname}, geb. ${formatDate(p.geburtsdatum)}`)],
      ['Anschrift', t(`${p.adresse.strasse}, ${p.adresse.plz} ${p.adresse.ort}`)],
      ['Versichertennummer', t(p.versicherung.versichertennummer || '–')],
      ['Verordnung', t(`vom ${formatDate(r.ausstellungsdatum)} durch ${arztName(arzt)}${arzt?.lanr ? ' (LANR ' + arzt.lanr + ')' : ''}`)],
      ['Diagnose', t(`${r.diagnose}${r.icd10 ? ' (ICD-10: ' + r.icd10 + ')' : ''}`)],
      ['Verordnete Leistung', t(r.verordnung)],
    ],
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  y = absatz(doc, 'für die oben genannte Person beantragen wir die Kostenübernahme für folgende Leistungen:', y);
  const summe = summePositionen(kv.positionen);
  y = positionsTabelle(doc, y, kv.positionen, [['Gesamtbetrag', formatEuro(summe)]]);
  if (kv.begruendung) y = absatz(doc, kv.begruendung, y, { titel: 'Begründung / Notwendigkeit' });
  if (kv.ziele) y = absatz(doc, kv.ziele, y, { titel: 'Trainingsziele' });
  y = absatz(doc, `${e.ustHinweis} Wir bitten um Erteilung einer Kostenzusage. Der Kostenvoranschlag ist 3 Monate gültig.`, y + 2);
  y = absatz(doc, `Mit freundlichen Grüßen\n\n${e.name}\n${e.berufsbezeichnung}`, y + 2);
  fusszeile(doc, e);
  return doc;
}

export function rechnungPdf(re: Rechnung, e: Einstellungen, rezept?: Rezept, arzt?: Arzt): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const infos: [string, string][] = [
    ['Rechnungsnummer', re.nummer],
    ['Rechnungsdatum', formatDate(re.datum)],
    ['Leistungszeitraum', `${formatDate(re.leistungszeitraum.von)} - ${formatDate(re.leistungszeitraum.bis)}`],
    ['Unser IK', e.ik],
  ];
  if (re.empfaenger.ik) infos.push(['Kostenträger-IK', re.empfaenger.ik]);
  let y = briefkopf(doc, e, {
    titel: `${re.status === 'storniert' ? 'STORNIERT – ' : ''}${re.art === 'teil' ? 'Teilrechnung' : 'Rechnung'} ${re.nummer}`,
    empfaenger: adresseZeilen(re.empfaenger.name, re.empfaenger.adresse),
    infos,
  });

  autoTable(doc, {
    startY: y,
    margin: { left: RAND, right: RAND, top: 20, bottom: 25 },
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
    body: [
      ['Versicherte/r', t(`${re.patientInfo.name}, geb. ${formatDate(re.patientInfo.geburtsdatum)}`)],
      ['Versichertennummer', t(re.patientInfo.versichertennummer || '–')],
      ...(rezept ? [['Verordnung', t(`${rezept.nummer} vom ${formatDate(rezept.ausstellungsdatum)}, ${arztName(arzt)}`)]] : []),
      ...(re.genehmigungsnummer ? [['Genehmigung', t(re.genehmigungsnummer)]] : []),
    ],
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  const summen: [string, string][] = [['Gesamtbetrag', formatEuro(re.summe)]];
  if (re.zuzahlung > 0) {
    summen.push(['abzgl. gesetzliche Zuzahlung (vom Versicherten erhoben)', '-' + formatEuro(re.zuzahlung)]);
    summen.push(['Zahlbetrag', formatEuro(re.zahlbetrag)]);
  }
  y = positionsTabelle(doc, y, re.positionen, summen);
  y = absatz(doc, e.ustHinweis, y);
  y = absatz(
    doc,
    `Bitte überweisen Sie den Betrag von ${formatEuro(re.zahlbetrag)} bis zum ${formatDate(re.faelligAm)} unter Angabe der Rechnungsnummer ${re.nummer} auf das unten genannte Konto.`,
    y,
  );
  if (re.status === 'storniert') y = absatz(doc, `Diese Rechnung wurde am ${formatDate(re.storniertAm)} storniert. Grund: ${re.stornoGrund || '–'}`, y, { titel: 'Storno' });
  absatz(doc, `Mit freundlichen Grüßen\n\n${e.name}`, y + 2);
  fusszeile(doc, e);
  return doc;
}

export function dokuPdf(r: Rezept, p: Patient, termine: Termin[], e: Einstellungen): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = briefkopf(doc, e, {
    titel: 'Leistungsnachweis und Verlaufsdokumentation',
    empfaenger: adresseZeilen(`${p.vorname} ${p.nachname}`, p.adresse),
    infos: [
      ['Verordnung', r.nummer],
      ['Geb.-Datum', formatDate(p.geburtsdatum)],
      ['Vers.-Nr.', p.versicherung.versichertennummer || '–'],
      ['Genehmigung', r.kv?.genehmigungsnummer || '–'],
    ],
  });
  // nur Termine mit Ergebnis (geplante, noch offene Termine gehören nicht in den Nachweis)
  const sortiert = termine.filter((x) => x.status !== 'geplant').sort((a, b) => a.start.localeCompare(b.start));
  autoTable(doc, {
    startY: y,
    margin: { left: RAND, right: RAND, top: 20, bottom: 25 },
    head: [['Datum', 'Zeit', 'UE', 'Status', 'Inhalte / Verlauf', 'Unterschrift']],
    body: sortiert.map((x) => [
      formatDate(x.start),
      formatTime(x.start),
      x.status === 'durchgefuehrt' ? String(x.einheiten) : '-',
      t(TERMIN_STATUS[x.status].label),
      t(x.doku ? `${x.doku.inhalte}${x.doku.verlauf ? '\nVerlauf: ' + x.doku.verlauf : ''}` : x.notiz ?? ''),
      '',
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.8, valign: 'top', minCellHeight: 12 },
    headStyles: { fillColor: [15, 92, 110], textColor: 255 },
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 12 }, 2: { cellWidth: 9 }, 3: { cellWidth: 22 }, 5: { cellWidth: 30 } },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const sig = sortiert[data.row.index]?.unterschrift;
        if (sig) {
          try {
            doc.addImage(sig, 'PNG', data.cell.x + 1, data.cell.y + 1, data.cell.width - 2, Math.min(data.cell.height - 2, 10));
          } catch {
            /* ungültiges Bild ignorieren */
          }
        }
      }
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const summe = sortiert.filter((x) => x.status === 'durchgefuehrt').reduce((s, x) => s + x.einheiten, 0);
  y = absatz(doc, `Summe geleisteter Einheiten: ${summe}`, y);
  absatz(doc, `\n\n_______________________________            _______________________________\nOrt, Datum, Unterschrift Reha-Fachkraft                   Unterschrift Versicherte/r`, y);
  fusszeile(doc, e);
  return doc;
}

const BERICHT_TITEL: Record<Bericht['typ'], string> = {
  eingang: 'Eingangsbefund',
  verlauf: 'Verlaufsbericht',
  abschluss: 'Abschlussbericht',
};

const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

function patientBlock(doc: jsPDF, y: number, zeilen: [string, string][]): number {
  autoTable(doc, {
    startY: y,
    margin: { left: RAND, right: RAND, top: 20, bottom: 25 },
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
    body: zeilen.map(([a, b]) => [t(a), t(b)]),
  });
  return lastY(doc) + 6;
}

export function berichtPdf(
  r: Rezept,
  p: Patient,
  b: Bericht,
  termine: Termin[],
  e: Einstellungen,
  kt?: Kostentraeger,
  arzt?: Arzt,
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const anArzt = b.empfaenger === 'arzt' || (!kt && arzt);
  const empfaenger = anArzt && arzt
    ? adresseZeilen([arzt.titel, arzt.name].filter(Boolean).join(' '), arzt.adresse, arzt.fachrichtung)
    : kt
      ? adresseZeilen(kt.name, kt.adresse)
      : adresseZeilen(`${p.vorname} ${p.nachname}`, p.adresse);
  let y = briefkopf(doc, e, {
    titel: `${BERICHT_TITEL[b.typ]} – Training ${r.leistungsart === 'LPF' ? 'Lebenspraktische Fähigkeiten' : 'Orientierung & Mobilität'}`,
    empfaenger,
    infos: [
      ['Datum', formatDate(b.datum)],
      ['Verordnung', r.nummer],
      ['Genehmigung', r.kv?.genehmigungsnummer || '-'],
    ],
  });
  const geleistet = termine.filter((x) => x.status === 'durchgefuehrt').sort((a, c) => a.start.localeCompare(c.start));
  const einheiten = geleistet.reduce((s, x) => s + x.einheiten, 0);
  y = patientBlock(doc, y, [
    ['Patient/in', `${p.vorname} ${p.nachname}, geb. ${formatDate(p.geburtsdatum)}`],
    ['Versichertennummer', p.versicherung.versichertennummer || '-'],
    ['Diagnose', `${r.diagnose}${r.icd10 ? ' (ICD-10: ' + r.icd10 + ')' : ''}`],
    ['Verordnung', `vom ${formatDate(r.ausstellungsdatum)}${arzt ? ' durch ' + arztName(arzt) : ''}, ${r.verordneteEinheiten} UE`],
    ['Leistungen bisher', geleistet.length ? `${einheiten} UE vom ${formatDate(geleistet[0].start)} bis ${formatDate(geleistet[geleistet.length - 1].start)}` : 'noch keine'],
  ]);
  const abschnitte: [string, string][] = [
    ['Ausgangslage / Befund', b.ausgangslage],
    ['Ziele', b.ziele],
    ['Verlauf', b.verlauf],
    [b.typ === 'eingang' ? 'Einschätzung' : 'Ergebnis', b.ergebnis],
    ['Empfehlung', b.empfehlung],
  ];
  for (const [titel, text] of abschnitte) if (text.trim()) y = absatz(doc, text, y, { titel });
  if (b.empfaenger === 'beide' && arzt && kt) y = absatz(doc, `Kopie an: ${arztName(arzt)}`, y);
  absatz(doc, `Mit freundlichen Grüßen\n\n${e.name}\n${e.berufsbezeichnung}`, y + 2);
  fusszeile(doc, e);
  return doc;
}

export function mahnungPdf(re: Rechnung, e: Einstellungen): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const stufe = Math.max(1, re.mahnstufe);
  let y = briefkopf(doc, e, {
    titel: stufe === 1 ? 'Zahlungserinnerung' : `${stufe}. Zahlungserinnerung`,
    empfaenger: adresseZeilen(re.empfaenger.name, re.empfaenger.adresse),
    infos: [
      ['Datum', formatDate(isoDate())],
      ['Rechnungsnummer', re.nummer],
      ['Rechnungsdatum', formatDate(re.datum)],
      ['Unser IK', e.ik],
    ],
  });
  y = absatz(doc, 'Sehr geehrte Damen und Herren,', y);
  y = absatz(
    doc,
    `zu unserer Rechnung ${re.nummer} vom ${formatDate(re.datum)} über ${formatEuro(re.zahlbetrag)} (Versicherte/r: ${re.patientInfo.name}, Vers.-Nr. ${re.patientInfo.versichertennummer || '-'}${re.genehmigungsnummer ? ', Genehmigung ' + re.genehmigungsnummer : ''}) konnten wir bis heute keinen Zahlungseingang feststellen. Die Zahlung war fällig am ${formatDate(re.faelligAm)}.`,
    y,
  );
  y = absatz(doc, `Sicherlich handelt es sich um ein Versehen. Bitte überweisen Sie den offenen Betrag von ${formatEuro(re.zahlbetrag)} bis zum ${formatDate(addDaysIso(isoDate(), 14))} auf das unten genannte Konto. Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos.`, y);
  absatz(doc, `Mit freundlichen Grüßen\n\n${e.name}`, y + 2);
  fusszeile(doc, e);
  return doc;
}

export function widerspruchPdf(r: Rezept, p: Patient, e: Einstellungen, kt?: Kostentraeger): jsPDF {
  const kv = r.kv!;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = briefkopf(doc, e, {
    titel: 'Widerspruch gegen die Ablehnung der Kostenübernahme',
    empfaenger: kt ? adresseZeilen(kt.name, kt.adresse) : adresseZeilen(`${p.vorname} ${p.nachname}`, p.adresse),
    infos: [
      ['Datum', formatDate(kv.widerspruchAm ?? isoDate())],
      ['Bescheid vom', formatDate(kv.antwortAm)],
      ['KV-Nummer', kv.nummer],
      ['Unser IK', e.ik],
    ],
  });
  y = patientBlock(doc, y, [
    ['Versicherte/r', `${p.vorname} ${p.nachname}, geb. ${formatDate(p.geburtsdatum)}`],
    ['Versichertennummer', p.versicherung.versichertennummer || '-'],
    ['Verordnung', `vom ${formatDate(r.ausstellungsdatum)}: ${r.verordnung}`],
  ]);
  y = absatz(doc, 'Sehr geehrte Damen und Herren,', y);
  y = absatz(
    doc,
    `gegen Ihren Bescheid vom ${formatDate(kv.antwortAm)}, mit dem die Kostenübernahme für das oben genannte Training abgelehnt wurde, legen wir im Auftrag und mit Einverständnis der versicherten Person hiermit Widerspruch ein.`,
    y,
  );
  if (kv.widerspruchBegruendung?.trim()) y = absatz(doc, kv.widerspruchBegruendung, y, { titel: 'Begründung' });
  y = absatz(doc, 'Wir bitten um erneute Prüfung und um Erteilung der Kostenzusage. Gerne stellen wir weitere Unterlagen zur Verfügung.', y);
  absatz(doc, `Mit freundlichen Grüßen\n\n${e.name}\n${e.berufsbezeichnung}`, y + 2);
  fusszeile(doc, e);
  return doc;
}

/** PDF anzeigen (öffnet in neuem Tab) bzw. herunterladen, falls Pop-ups blockiert sind */
export function zeigePdf(doc: jsPDF, dateiname: string) {
  const url = doc.output('bloburl');
  const w = window.open(String(url), '_blank');
  if (!w) doc.save(dateiname);
}

export function ladePdf(doc: jsPDF, dateiname: string) {
  doc.save(dateiname);
}
