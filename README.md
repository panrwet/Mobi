# Mobi – Praxissoftware für Reha-Fachkräfte Orientierung & Mobilität (O&M)

Mobile-first Web-App (PWA) zur Verwaltung von Patienten, Verordnungen, Kostenvoranschlägen,
Terminen, Dokumentation, Berichten und Rechnungen. **Alle Daten bleiben lokal im Browser des
Geräts** (IndexedDB) – es gibt keinen Server.

> ⚠️ Testversion mit **fiktiven Beispieldaten**. Keine echten Patientendaten eingeben, solange
> Datensicherung/Verschlüsselung nicht geklärt sind (siehe „Datenschutz“).

## Funktionen

| Bereich | Inhalt |
|---|---|
| **Startseite** | Suche, Schnellzugriff, Kennzahlen, Termine heute, **Eingangsliste** aller offenen Rezepte (mit nächstem Schritt und Hinweisen), offene Rechnungen, abgeschlossene Rezepte |
| **Patienten** | Stammdaten, Versicherung/Kostenträger, Versichertennummer, Zuzahlungsbefreiung, Sehstatus, Visus, GdB/Merkzeichen, Einwilligungen (Datenschutz, Schweigepflichtentbindung), Archiv |
| **Rezepte** | Verordnung (Arzt, Diagnose, ICD-10, Einheiten), Status-Pipeline, Verlauf/Audit-Trail, Stornierung, **Folgeverordnung per Knopfdruck** (übernimmt Daten, Folgeantrag-Begründung im KV) |
| **Kostenvoranschlag** | Positionen aus Leistungskatalog, Begründung, Ziele, **PDF**, „versendet“, Genehmigung / Teilgenehmigung / Ablehnung mit Genehmigungsnummer, **Widerspruch** inkl. Schreiben als PDF |
| **Berichte** | Eingangsbefund, Verlaufsbericht, Abschlussbericht an Arzt und/oder Kostenträger – Textbausteine aus Patientendaten und Termindoku, **PDF** |
| **Dokumente** | Verordnung, Genehmigung, Bescheide usw. per Kamera/Datei ablegen (Fotos automatisch verkleinert) |
| **Termine** | Einzeltermine und **Serienplanung** (Wochentage, Anzahl, Konfliktprüfung), Status (geplant, durchgeführt, abgesagt, ausgefallen), km |
| **Dokumentation** | Je Termin Inhalte / Verlauf / nächste Schritte, **Unterschrift per Finger**, Leistungsnachweis als PDF |
| **Kalender** | Tag (mit Wochenleiste), Woche, Monat |
| **Rechnungen** | **Teil- und Schlussrechnung** aus KV + geleisteten Einheiten + km (nichts wird doppelt berechnet, abgerechnete Termine sind gesperrt), fortlaufende Nummern, **PDF**, Zahlungseingang, **Zahlungserinnerung als PDF**, Storno (keine Löschung, GoBD) |
| **Statistik** | Abgerechnet / Zahlungseingang, Einheiten pro Monat, Ausfallquote, Ø KV-Bearbeitungszeit, nach Kostenträger, **CSV-Rechnungsausgangsbuch** |
| **Suche** | Über Patienten, Rezepte, Rechnungen, Dokumente und Adressbuch |
| **Stammdaten** | Name, Berufsbezeichnung, Adresse, IK, Steuernummer, USt-Hinweis, Bankverbindung (IBAN-Prüfung), Leistungen & Preise, Kostenträger, Ärzte |
| **Einstellungen** | Fristen (KV-Wiedervorlage, Verordnungsgültigkeit), Zahlungsziel, Nummernkreise, Zuzahlung, Farbschema, **Datensicherung** (optional mit Passwort verschlüsselt), Beispieldaten neu laden |

### Status eines Rezepts

`Neu → KV in Arbeit → KV versendet → Genehmigt → Termine verplant → In Behandlung → (Doku offen) → Abrechenbar → Rechnung gestellt → Abgeschlossen`
(+ `KV abgelehnt`, `Widerspruch läuft`, `Storniert`)

Der Status wird **automatisch** aus KV, Terminen, Dokumentation und Rechnungen berechnet
(`src/lib/status.ts`). Zusätzliche Hinweise erscheinen z. B. bei unbeantwortetem KV,
Terminen ohne Status, fehlender Doku, überfälligen Rechnungen oder alten Verordnungen.

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver
npm test           # Unit-Tests (Statuslogik, Abrechnung, Beispieldaten, PDFs)
npm run build      # Produktions-Build nach dist/
```

Technik: React 19, TypeScript, Vite, Dexie (IndexedDB), jsPDF. Routing per Hash, daher als
statische Seite überall hostbar.

## Auf dem Smartphone nutzen

Der Workflow `.github/workflows/deploy.yml` veröffentlicht jeden Stand von `main` auf GitHub Pages.
Einmalig im Repo unter **Settings → Pages → Source: „GitHub Actions“** aktivieren. Danach die
Seite im Smartphone-Browser öffnen und „Zum Startbildschirm hinzufügen“ – die App läuft dann
wie eine installierte App und auch offline.

## Datenschutz & Recht (Kurzfassung)

- Gesundheitsdaten (Art. 9 DSGVO): lokale Speicherung, keine Cloud → kein C5-Testat nach § 393 SGB V nötig.
  Gerät mit Bildschirmsperre und Geräteverschlüsselung schützen, Sicherungen mit Passwort erstellen.
- Aufbewahrung: Dokumentation 10 Jahre (§ 630f BGB), Rechnungen 8 Jahre (§ 147 AO).
- GKV-Abrechnung: § 302 SGB V sieht elektronische Abrechnung vor; Papier-/PDF-Rechnungen können
  mit 5 % Abzug belegt werden (§ 303 SGB V). Eigenes IK erforderlich.
- Diese Software ersetzt keine Rechts- oder Steuerberatung.

## Mögliche nächste Schritte

- Elektronische Abrechnung nach § 302 SGB V (bewusst nicht umgesetzt)
