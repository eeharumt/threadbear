// Photos for a message, as the Android app's Photos.kt: each is made a JPEG
// no longer than 2048 px on its long edge (PhotoPrep), put up as soon as it's
// picked (phone:imageUploadUrl), and sent by its storage id with the words.
// One taken back out before it's sent is taken off the backend too
// (phone:discardImage).
import { useEffect, useRef, useState, type ClipboardEvent, type ReactNode } from 'react';
import { useMutation } from 'convex/react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Icon } from './icon';
import { Spinner } from './parts';

// PhotoPrep.kt's numbers.
const MAX_PIXELS = 2048;
export const MAX_PHOTOS = 6;
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 100_000_000;
const JPEG_QUALITY = 0.85;

export type Photo = { key: string; url?: string; storageId?: Id<'_storage'>; state: 'preparing' | 'uploading' | 'up' | 'failed'; problem?: string };

/** A picture as a JPEG for sending: scaled down to fit, on white, as JPEG has no transparency. */
async function prepare(file: Blob): Promise<Blob> {
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Too big to send');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Couldn't read it");
  }
  try {
    if (bitmap.width * bitmap.height > MAX_SOURCE_PIXELS) throw new Error('Too big to send');
    const scale = Math.min(1, MAX_PIXELS / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', JPEG_QUALITY));
    if (!jpeg) throw new Error("Couldn't read it");
    return jpeg;
  } finally {
    bitmap.close();
  }
}

// The upload address sends no CORS headers (only the native apps post to
// it), so in the app the post goes from Rust (lib.rs, upload_photo).
async function post(url: string, jpeg: Blob): Promise<Id<'_storage'>> {
  const text = isTauri()
    ? await invoke<string>('upload_photo', new Uint8Array(await jpeg.arrayBuffer()), { headers: { 'x-upload-url': url } })
    : await fetch(url, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: jpeg }).then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.text();
      });
  const id = (JSON.parse(text) as { storageId?: string }).storageId;
  if (!id) throw new Error("The upload didn't take");
  return id as Id<'_storage'>;
}

function words(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return /too many photos/i.test(m) ? 'Too many photos for now' : /too big/i.test(m) ? 'Too big to send' : m.length < 40 ? m : "Couldn't upload it";
}

export type PhotoBox = ReturnType<typeof usePhotos>;

export function usePhotos(token: string) {
  const uploadUrl = useMutation(api.phone.imageUploadUrl);
  const discard = useMutation(api.phone.discardImage);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const sources = useRef(new Map<string, Blob>());
  const next = useRef(0);
  // The list the uploads see, kept beside the state: a photo taken out while
  // its upload is in flight is dropped from here at once, so the upload can
  // take it off the backend too.
  const shown = useRef<Photo[]>([]);
  const keep = (all: Photo[]) => {
    shown.current = all;
    setPhotos(all);
  };
  const change = (key: string, p: Partial<Photo>) => keep(shown.current.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const upload = async (key: string, source: Blob) => {
    change(key, { state: 'preparing', problem: undefined });
    try {
      const jpeg = await prepare(source);
      change(key, { url: URL.createObjectURL(jpeg), state: 'uploading' });
      const storageId = await post(await uploadUrl({ token }), jpeg);
      // Taken out while it went up: it goes from the backend too.
      if (!shown.current.some((x) => x.key === key)) return void discard({ token, storageId });
      sources.current.delete(key);
      change(key, { storageId, state: 'up' });
    } catch (e) {
      change(key, { state: 'failed', problem: words(e) });
    }
  };

  // The previews' addresses go with the screen.
  useEffect(() => () => shown.current.forEach((p) => p.url && URL.revokeObjectURL(p.url)), []);

  return {
    photos,
    room: MAX_PHOTOS - photos.length,
    /** Every photo is up, so a send now takes them all. */
    ready: photos.every((p) => p.state === 'up'),
    ids: photos.flatMap((p) => (p.storageId ? [p.storageId] : [])),
    add(files: Blob[]) {
      const take = files.filter((f) => !f.type || f.type.startsWith('image/')).slice(0, MAX_PHOTOS - shown.current.length);
      const added = take.map((f) => {
        const key = `p${next.current++}`;
        sources.current.set(key, f);
        return { key, state: 'preparing' as const };
      });
      keep([...shown.current, ...added]);
      added.forEach((p) => void upload(p.key, sources.current.get(p.key)!));
    },
    retry(key: string) {
      const source = sources.current.get(key);
      if (source) void upload(key, source);
    },
    remove(key: string) {
      const p = shown.current.find((x) => x.key === key);
      if (!p) return;
      if (p.storageId) void discard({ token, storageId: p.storageId });
      if (p.url) URL.revokeObjectURL(p.url);
      sources.current.delete(key);
      keep(shown.current.filter((x) => x.key !== key));
    },
    /** Out of the box as they're sent, kept to put back if the send fails. */
    take(): Photo[] {
      const sent = shown.current;
      keep([]);
      return sent;
    },
    putBack(sent: Photo[]) {
      keep([...sent, ...shown.current].slice(0, MAX_PHOTOS));
    },
    /** Sent for good: their previews can go. */
    done(sent: Photo[]) {
      sent.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    },
  };
}

/** The photo button: the system's picker, which offers the camera too on a phone. */
export function PhotoButton({ box, disabled, label, className = '', children }: { box: PhotoBox; disabled?: boolean; label: string; className?: string; children: ReactNode }) {
  const off = !!disabled || box.room <= 0;
  return (
    <label className={`${className} ${off ? 'is-off' : ''}`} aria-label={label} title={label}>
      <input
        type="file"
        accept="image/*"
        multiple
        hidden
        disabled={off}
        onChange={(e) => {
          box.add([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      {children}
    </label>
  );
}

/** Pictures pasted into a field go in as photos; text pastes as usual. */
export function pastePhotos(box: PhotoBox) {
  return (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    box.add(files);
  };
}

/** The row of thumbnails over the field, each with its ✕, a spinner while it goes up, and Retry if it didn't. */
export function PhotoStrip({ box, disabled }: { box: PhotoBox; disabled?: boolean }) {
  if (!box.photos.length) return null;
  return (
    <div className="photo-strip">
      {box.photos.map((p) => (
        <div key={p.key} className={`photo-tile ${p.state}`}>
          {p.url ? <img src={p.url} alt="" /> : null}
          {p.state === 'preparing' || p.state === 'uploading' ? (
            <span className="photo-veil">
              <Spinner size={18} />
            </span>
          ) : p.state === 'failed' ? (
            <button className="photo-veil failed" onClick={() => box.retry(p.key)} title={p.problem} aria-label={`${p.problem ?? "Couldn't upload it"}. Try again`}>
              <Icon name="retry" size={18} />
            </button>
          ) : null}
          {disabled ? null : (
            <button className="photo-remove" onClick={() => box.remove(p.key)} aria-label="Remove the photo">
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
