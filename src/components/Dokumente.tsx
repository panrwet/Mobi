import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, loeschen, newId } from '../db/db';
import type { DokumentKategorie } from '../db/types';
import { formatDate, isoDate } from '../lib/format';
import { Icon } from './Icon';
import { Badge, Card, Empty, Field, Sheet, useToast } from './ui';

const KATEGORIEN: DokumentKategorie[] = ['Verordnung', 'Genehmigung', 'Bescheid', 'Befund', 'Schriftverkehr', 'Einwilligung', 'Sonstiges'];
const MAX_BYTES = 8 * 1024 * 1024;

/** Fotos werden verkleinert (max. 1800 px, JPEG), damit die lokale Datenbank klein bleibt */
async function bildVerkleinern(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fehler) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = fehler;
      i.src = url;
    });
    const f = Math.min(1, 1800 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * f);
    c.height = Math.round(img.height * f);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const alsDataUrl = (file: File) =>
  new Promise<string>((ok, fehler) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = fehler;
    r.readAsDataURL(file);
  });

export function oeffneDokument(daten: string) {
  const [kopf, b64] = daten.split(',');
  const mime = /data:([^;]+)/.exec(kopf)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function Dokumente({ patientId, rezeptId, titel = 'Dokumente' }: { patientId: string; rezeptId?: string; titel?: string }) {
  const toast = useToast();
  const dokumente = useLiveQuery(
    () => (rezeptId ? db.dokumente.where('rezeptId').equals(rezeptId).toArray() : db.dokumente.where('patientId').equals(patientId).toArray()),
    [patientId, rezeptId],
  );
  const rezepte = useLiveQuery(() => db.rezepte.where('patientId').equals(patientId).toArray(), [patientId]);
  const [neu, setNeu] = useState<{ file: File; titel: string; kategorie: DokumentKategorie; datum: string; rezeptId?: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const gewaehlt = (file?: File) => {
    if (!file) return;
    if (file.size > MAX_BYTES * 3) return alert('Die Datei ist zu groß (max. 24 MB).');
    setNeu({ file, titel: file.name.replace(/\.[^.]+$/, ''), kategorie: rezeptId ? 'Verordnung' : 'Sonstiges', datum: isoDate(), rezeptId });
  };

  const speichern = async () => {
    if (!neu) return;
    setLaeuft(true);
    try {
      const istBild = neu.file.type.startsWith('image/');
      const daten = istBild ? await bildVerkleinern(neu.file) : await alsDataUrl(neu.file);
      if (daten.length > MAX_BYTES * 1.4) throw new Error('Die Datei ist zu groß (max. 8 MB).');
      await db.dokumente.add({
        id: newId(),
        patientId,
        rezeptId: neu.rezeptId || undefined,
        titel: neu.titel || neu.kategorie,
        kategorie: neu.kategorie,
        datum: neu.datum,
        mime: istBild ? 'image/jpeg' : neu.file.type,
        groesse: Math.round((daten.length * 3) / 4),
        daten,
        erstelltAm: new Date().toISOString(),
      });
      toast('Dokument gespeichert');
      setNeu(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  };

  const sortiert = [...(dokumente ?? [])].sort((a, b) => b.datum.localeCompare(a.datum));

  return (
    <Card
      title={titel}
      action={
        <label className="btn small">
          <Icon name="camera" size={16} /> Hinzufügen
          <input type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(ev) => gewaehlt(ev.target.files?.[0])} />
        </label>
      }
    >
      {dokumente && sortiert.length === 0 && <Empty>Noch keine Dokumente. Verordnung oder Genehmigung einfach abfotografieren.</Empty>}
      <ul className="list">
        {sortiert.map((d) => (
          <li key={d.id}>
            <div className="list-item">
              {d.mime.startsWith('image/') ? (
                <img src={d.daten} alt="" style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 8, flex: 'none', border: '1px solid var(--border)' }} />
              ) : (
                <span className="avatar">
                  <Icon name="pdf" size={20} />
                </span>
              )}
              <button className="main btn ghost" style={{ textAlign: 'left', padding: 0, minHeight: 0, fontWeight: 'normal', display: 'block', whiteSpace: 'normal' }} onClick={() => oeffneDokument(d.daten)}>
                <div className="title">{d.titel}</div>
                <div className="sub">
                  {formatDate(d.datum)} · {Math.round(d.groesse / 1024)} KB
                </div>
              </button>
              <Badge>{d.kategorie}</Badge>
              <button
                className="icon-btn"
                aria-label="Dokument löschen"
                onClick={async () => {
                  if (confirm(`„${d.titel}“ löschen?`)) await loeschen('dokumente', d.id);
                }}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Sheet open={!!neu} onClose={() => setNeu(null)} title="Dokument speichern">
        {neu && (
          <>
            <Field label="Titel">
              <input value={neu.titel} onChange={(e) => setNeu({ ...neu, titel: e.target.value })} />
            </Field>
            <div className="grid2">
              <Field label="Kategorie">
                <select value={neu.kategorie} onChange={(e) => setNeu({ ...neu, kategorie: e.target.value as DokumentKategorie })}>
                  {KATEGORIEN.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </Field>
              <Field label="Datum">
                <input type="date" value={neu.datum} onChange={(e) => setNeu({ ...neu, datum: e.target.value })} />
              </Field>
            </div>
            {!rezeptId && (
              <Field label="Zu Rezept (optional)">
                <select value={neu.rezeptId ?? ''} onChange={(e) => setNeu({ ...neu, rezeptId: e.target.value || undefined })}>
                  <option value="">–</option>
                  {rezepte?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nummer} vom {formatDate(r.ausstellungsdatum)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <p className="hint">Wird verschlüsselt auf diesem Gerät gespeichert. Fotos werden automatisch verkleinert.</p>
            <button className="btn primary block" disabled={laeuft} onClick={speichern}>
              {laeuft ? 'Speichere …' : 'Speichern'}
            </button>
          </>
        )}
      </Sheet>
    </Card>
  );
}
