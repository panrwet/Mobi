// Reine Logik zur Status-Ermittlung eines Rezepts (ohne Datenbankzugriff, daher testbar).
import type { Einstellungen, Rechnung, Rezept, Termin } from '../db/types';
import { daysBetween, parseDate } from './format';

export type RezeptPhase =
  | 'neu'
  | 'kv_entwurf'
  | 'kv_versendet'
  | 'kv_abgelehnt'
  | 'kv_widerspruch'
  | 'genehmigt'
  | 'termine_verplant'
  | 'in_behandlung'
  | 'doku_offen'
  | 'abrechenbar'
  | 'abgerechnet'
  | 'abgeschlossen'
  | 'storniert';

export type Tone = 'neutral' | 'info' | 'warn' | 'danger' | 'ok';

export const PHASEN: Record<RezeptPhase, { label: string; tone: Tone; aktion: string; reihenfolge: number }> = {
  neu: { label: 'Neu', tone: 'info', aktion: 'Kostenvoranschlag erstellen', reihenfolge: 1 },
  kv_entwurf: { label: 'KV in Arbeit', tone: 'info', aktion: 'KV fertigstellen und versenden', reihenfolge: 2 },
  kv_versendet: { label: 'KV versendet', tone: 'neutral', aktion: 'Genehmigung abwarten', reihenfolge: 3 },
  kv_abgelehnt: { label: 'KV abgelehnt', tone: 'danger', aktion: 'Widerspruch einlegen oder Rezept stornieren', reihenfolge: 0 },
  kv_widerspruch: { label: 'Widerspruch läuft', tone: 'warn', aktion: 'Entscheidung des Kostenträgers abwarten', reihenfolge: 3 },
  genehmigt: { label: 'Genehmigt', tone: 'info', aktion: 'Termine planen', reihenfolge: 4 },
  termine_verplant: { label: 'Termine verplant', tone: 'neutral', aktion: 'Termine durchführen', reihenfolge: 5 },
  in_behandlung: { label: 'In Behandlung', tone: 'neutral', aktion: 'Termine durchführen und dokumentieren', reihenfolge: 6 },
  doku_offen: { label: 'Doku offen', tone: 'warn', aktion: 'Fehlende Dokumentation ergänzen', reihenfolge: 7 },
  abrechenbar: { label: 'Abrechenbar', tone: 'warn', aktion: 'Rechnung erstellen', reihenfolge: 8 },
  abgerechnet: { label: 'Rechnung gestellt', tone: 'neutral', aktion: 'Zahlungseingang prüfen', reihenfolge: 9 },
  abgeschlossen: { label: 'Abgeschlossen', tone: 'ok', aktion: '–', reihenfolge: 10 },
  storniert: { label: 'Storniert', tone: 'neutral', aktion: '–', reihenfolge: 11 },
};

export interface Warnung {
  text: string;
  tone: 'warn' | 'danger';
}

export interface Schritt {
  label: string;
  erledigt: boolean;
}

export interface RezeptAuswertung {
  phase: RezeptPhase;
  label: string;
  tone: Tone;
  aktion: string;
  zielEinheiten: number;
  geplantEinheiten: number; // noch offene, geplante Termine
  geleistetEinheiten: number;
  dokuFehlt: number;
  vergangeneOhneStatus: number;
  warnungen: Warnung[];
  schritte: Schritt[];
  aktiveRechnung?: Rechnung;
  /** geleistete Einheiten, die noch in keiner Rechnung stehen */
  nichtAbgerechnet: number;
  offen: boolean; // gehört in die Eingangsliste
}

const sumEinheiten = (ts: Termin[]) => ts.reduce((s, t) => s + (t.einheiten || 0), 0);

export function werteRezeptAus(
  rezept: Rezept,
  termine: Termin[],
  rechnungen: Rechnung[],
  e: Pick<Einstellungen, 'kvWiedervorlageTage' | 'verordnungGueltigTage'>,
  jetzt: Date = new Date(),
): RezeptAuswertung {
  const kv = rezept.kv;
  const kvGenehmigt = kv?.status === 'genehmigt' || kv?.status === 'teilgenehmigt';
  const zielEinheiten = kvGenehmigt && kv?.genehmigteEinheiten ? kv.genehmigteEinheiten : rezept.verordneteEinheiten;

  const durchgefuehrt = termine.filter((t) => t.status === 'durchgefuehrt');
  const geplant = termine.filter((t) => t.status === 'geplant');
  const geleistetEinheiten = sumEinheiten(durchgefuehrt);
  const geplantEinheiten = sumEinheiten(geplant);
  const dokuFehlt = durchgefuehrt.filter((t) => !t.doku || !t.doku.inhalte.trim()).length;
  const vergangeneOhneStatus = geplant.filter((t) => {
    const s = parseDate(t.start);
    return s ? s.getTime() + t.dauerMin * 60000 < jetzt.getTime() : false;
  }).length;

  const nichtAbgerechnet = sumEinheiten(durchgefuehrt.filter((t) => !t.rechnungId));
  const gueltige = rechnungen.filter((r) => r.status !== 'storniert');
  // Rechnungen ohne Art (ältere Daten) gelten als Schlussrechnung
  const schluss = gueltige.filter((r) => r.art !== 'teil');
  const aktiveRechnung =
    schluss.find((r) => r.status === 'offen') ??
    schluss.find((r) => r.status === 'bezahlt') ??
    [...gueltige].sort((a, b) => b.datum.localeCompare(a.datum))[0];
  const alleBezahlt = gueltige.every((r) => r.status === 'bezahlt');

  let phase: RezeptPhase;
  if (rezept.storniert) phase = 'storniert';
  else if (schluss.length > 0) phase = alleBezahlt ? 'abgeschlossen' : 'abgerechnet';
  else if (!kv) phase = 'neu';
  else if (kv.status === 'entwurf') phase = 'kv_entwurf';
  else if (kv.status === 'versendet') phase = 'kv_versendet';
  else if (kv.status === 'abgelehnt') phase = 'kv_abgelehnt';
  else if (kv.status === 'widerspruch') phase = 'kv_widerspruch';
  else if (geleistetEinheiten >= zielEinheiten) phase = dokuFehlt > 0 ? 'doku_offen' : 'abrechenbar';
  else if (geleistetEinheiten > 0) phase = 'in_behandlung';
  else if (geplantEinheiten >= zielEinheiten) phase = 'termine_verplant';
  else phase = 'genehmigt';

  const warnungen: Warnung[] = [];
  const aktiv = phase !== 'storniert' && phase !== 'abgeschlossen';

  if (aktiv) {
    const ausgestellt = parseDate(rezept.ausstellungsdatum);
    if (ausgestellt && durchgefuehrt.length === 0 && daysBetween(ausgestellt, jetzt) > e.verordnungGueltigTage) {
      warnungen.push({
        text: `Verordnung älter als ${e.verordnungGueltigTage} Tage ohne Behandlungsbeginn – Gültigkeit prüfen`,
        tone: 'warn',
      });
    }
    if (kv?.status === 'versendet' && kv.versendetAm) {
      const tage = daysBetween(parseDate(kv.versendetAm)!, jetzt);
      if (tage >= e.kvWiedervorlageTage) {
        warnungen.push({ text: `KV seit ${tage} Tagen ohne Antwort – beim Kostenträger nachfragen`, tone: 'warn' });
      }
    }
    if (vergangeneOhneStatus > 0) {
      warnungen.push({
        text: `${vergangeneOhneStatus} vergangene${vergangeneOhneStatus === 1 ? 'r' : ''} Termin${vergangeneOhneStatus === 1 ? '' : 'e'} ohne Status`,
        tone: 'warn',
      });
    }
    if (dokuFehlt > 0 && phase !== 'doku_offen') {
      warnungen.push({ text: `${dokuFehlt} Termin${dokuFehlt === 1 ? '' : 'e'} ohne Dokumentation`, tone: 'warn' });
    }
    if (kvGenehmigt && geleistetEinheiten + geplantEinheiten > zielEinheiten) {
      warnungen.push({
        text: `Mehr Einheiten verplant (${geleistetEinheiten + geplantEinheiten}) als genehmigt (${zielEinheiten})`,
        tone: 'danger',
      });
    }
    for (const re of gueltige.filter((r) => r.status === 'offen')) {
      const faellig = parseDate(re.faelligAm);
      if (faellig && daysBetween(faellig, jetzt) > 0) {
        warnungen.push({ text: `Rechnung ${re.nummer} seit ${daysBetween(faellig, jetzt)} Tagen überfällig`, tone: 'danger' });
      }
    }
    const berichtImKv = kv?.positionen.some((p) => p.typ === 'pauschal' && (p.zeitpunkt === 'ende' || p.leistungId === 'l-bericht'));
    const hatAbschluss = rezept.berichte?.some((b) => b.typ === 'abschluss');
    if ((phase === 'abrechenbar' || phase === 'doku_offen') && berichtImKv && !hatAbschluss) {
      warnungen.push({ text: 'Abschlussbericht noch nicht erstellt', tone: 'warn' });
    }
  }

  const schritte: Schritt[] = [
    { label: 'Rezept erfasst', erledigt: true },
    { label: 'KV erstellt', erledigt: !!kv && kv.status !== 'entwurf' },
    { label: 'KV genehmigt', erledigt: kvGenehmigt },
    { label: 'Termine verplant', erledigt: geleistetEinheiten + geplantEinheiten >= zielEinheiten },
    { label: 'Termine geleistet', erledigt: geleistetEinheiten >= zielEinheiten },
    { label: 'Doku vollständig', erledigt: geleistetEinheiten >= zielEinheiten && dokuFehlt === 0 },
    { label: 'Rechnung gestellt', erledigt: schluss.length > 0 },
    { label: 'Bezahlt', erledigt: schluss.length > 0 && alleBezahlt },
  ];

  const info = PHASEN[phase];
  return {
    phase,
    label: info.label,
    tone: info.tone,
    aktion: info.aktion,
    zielEinheiten,
    geplantEinheiten,
    geleistetEinheiten,
    dokuFehlt,
    vergangeneOhneStatus,
    warnungen,
    schritte,
    aktiveRechnung,
    nichtAbgerechnet,
    offen: aktiv,
  };
}

/** Sortierung der Eingangsliste: Warnungen zuerst, dann nach Dringlichkeit der Phase */
export function prioritaet(a: RezeptAuswertung): number {
  const hatDanger = a.warnungen.some((w) => w.tone === 'danger');
  const hatWarn = a.warnungen.length > 0;
  const phasePrio: Partial<Record<RezeptPhase, number>> = {
    kv_abgelehnt: 0,
    kv_widerspruch: 8,
    abrechenbar: 1,
    doku_offen: 2,
    neu: 3,
    kv_entwurf: 4,
    genehmigt: 5,
    in_behandlung: 6,
    termine_verplant: 7,
    kv_versendet: 8,
    abgerechnet: 9,
  };
  return (hatDanger ? 0 : hatWarn ? 100 : 200) + (phasePrio[a.phase] ?? 50);
}

export const TERMIN_STATUS: Record<Termin['status'], { label: string; tone: Tone }> = {
  geplant: { label: 'Geplant', tone: 'info' },
  durchgefuehrt: { label: 'Durchgeführt', tone: 'ok' },
  abgesagt_patient: { label: 'Abgesagt (Patient)', tone: 'neutral' },
  abgesagt_praxis: { label: 'Abgesagt (Praxis)', tone: 'neutral' },
  ausgefallen: { label: 'Ausgefallen', tone: 'danger' },
};

export const KV_STATUS: Record<NonNullable<Rezept['kv']>['status'], { label: string; tone: Tone }> = {
  entwurf: { label: 'Entwurf', tone: 'info' },
  versendet: { label: 'Versendet', tone: 'neutral' },
  genehmigt: { label: 'Genehmigt', tone: 'ok' },
  teilgenehmigt: { label: 'Teilweise genehmigt', tone: 'warn' },
  abgelehnt: { label: 'Abgelehnt', tone: 'danger' },
  widerspruch: { label: 'Widerspruch eingelegt', tone: 'warn' },
};
