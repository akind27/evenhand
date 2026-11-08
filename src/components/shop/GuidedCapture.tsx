'use client';
import { useRef, useState } from 'react';
import { AiLabel } from '@/components/common/AiLabel';
import { RecordedAiNote } from '@/components/common/RecordedAiNote';
import { ErrorLine } from '@/components/doc/DocParts';
import { PhotoWindow } from '@/components/doc/PhotoWindow';
import { errorMessage, overridePhoto, uploadPhoto } from '@/lib/client/api';
import { isNotChecked } from '@/lib/client/photo-check';
import { resizeToJpeg } from '@/lib/client/resize';
import type { PhotoCheck } from '@/lib/domain/state';
import { REQUIRED_ANGLES, type Angle, type Phase, type PhotoRef } from '@/lib/domain/types';

export type SampleSet = 'pickup' | 'return-clean' | 'return-damaged';

interface GuidedCaptureProps {
  handoverId: string;
  phase: Phase;
  existing: PhotoRef[];
  guidePhotos?: PhotoRef[];
  sampleSet?: SampleSet;
  /** True for a demo shop: only then is "Use sample photo" offered, whatever the server mode (Ruling R35). */
  demoShop?: boolean;
  /** The AI check of each photo, by photo id. */
  checks?: Record<string, PhotoCheck>;
  /** Failed checks per "phase:angle", as the server counts them, so "Use anyway" survives a reload (M13). */
  photoTries?: Record<string, number>;
  /** Called after every upload or override so the screen can reload. */
  onChange?: () => void;
}

interface Result {
  photoId: string;
  check: PhotoCheck;
  tries: number;
}

const TITLE: Record<Angle, string> = { front: 'Front', back: 'Back', left: 'Left side', right: 'Right side', closeup: 'Close-up' };
const MAX_CLOSEUPS = 4;
const accepted = (check: PhotoCheck | undefined) => check !== undefined && (check.usable || check.overridden);

/** One angle at a time. Four boxes show progress; the camera button is the main thing on the screen. */
export function GuidedCapture(props: GuidedCaptureProps) {
  const { handoverId, phase, existing, guidePhotos = [], sampleSet, demoShop = false, checks = {}, photoTries = {}, onChange } = props;
  const input = useRef<HTMLInputElement>(null);
  const closeupInput = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Angle | null>(null);
  const [results, setResults] = useState<Partial<Record<Angle, Result>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photoFor = (angle: Angle) => existing.find((p) => p.angle === angle);
  const checkFor = (angle: Angle): PhotoCheck | undefined => {
    const photo = photoFor(angle);
    if (photo === undefined) return undefined;
    const local = results[angle];
    return local?.photoId === photo.id ? local.check : checks[photo.id];
  };
  const pending = REQUIRED_ANGLES.find((angle) => !accepted(checkFor(angle)));
  const angle: Angle = picked ?? pending ?? 'front';
  const photo = photoFor(angle);
  const check = checkFor(angle);
  const guide = guidePhotos.find((p) => p.angle === angle);
  // The server decides when a photo may be kept anyway (two failed tries, never a person); this mirrors it.
  const tries = Math.max(results[angle]?.tries ?? 0, photoTries[`${phase}:${angle}`] ?? 0);
  const mayKeepAnyway = check !== undefined && !accepted(check) && tries >= 2 && !check.personVisible;
  const closeups = existing.filter((p) => p.angle === 'closeup');
  const allDone = pending === undefined;

  async function send(target: Angle, file: Blob, source: 'camera' | 'sample') {
    setBusy(true);
    setError(null);
    try {
      // Sample photos go up unchanged: re-encoding would change their SHA-256, and the recorded AI answers are keyed by it.
      const jpeg = source === 'sample' ? file : await resizeToJpeg(file);
      const out = await uploadPhoto(handoverId, { phase, angle: target, source, file: jpeg });
      const failed = out.check.usable ? 0 : 1;
      setResults((prev) => ({ ...prev, [target]: { photoId: out.photo.id, check: out.check, tries: failed === 0 ? 0 : (prev[target]?.tries ?? 0) + 1 } }));
      setPicked(out.check.usable ? null : target);
      onChange?.();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function useSample() {
    if (sampleSet === undefined) return;
    try {
      const response = await fetch(`/demo/scooter-a/${sampleSet}/${angle}.jpg`);
      if (!response.ok) throw new Error('missing sample');
      await send(angle, await response.blob(), 'sample');
    } catch {
      setError('The sample photo could not be loaded.');
    }
  }

  async function useAnyway() {
    if (photo === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await overridePhoto(handoverId, photo.id);
      setPicked(null);
      onChange?.();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  function onFile(files: FileList | null) {
    const file = files?.[0];
    if (file) void send(angle, file, 'camera');
    if (input.current) input.current.value = '';
  }

  const collapsed = allDone && picked === null;
  const closeupControl =
    allDone && phase === 'pickup' && closeups.length < MAX_CLOSEUPS ? (
      <>
        <input
          ref={closeupInput}
          type="file"
          accept="image/jpeg,image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void send('closeup', file, 'camera');
            if (closeupInput.current) closeupInput.current.value = '';
          }}
        />
        <button type="button" className="btn" disabled={busy} onClick={() => closeupInput.current?.click()}>
          Add a close-up (optional, {closeups.length}/{MAX_CLOSEUPS})
        </button>
      </>
    ) : null;

  return (
    <section aria-label="Photos">
      <ol className="m-0 grid list-none grid-cols-4 gap-1.5 p-0" aria-label="Progress">
        {REQUIRED_ANGLES.map((a) => {
          const p = photoFor(a);
          const done = accepted(checkFor(a));
          return (
            <li key={a}>
              <button
                type="button"
                aria-current={!collapsed && a === angle}
                aria-label={`${TITLE[a]}${done ? ', done' : ''}`}
                onClick={() => setPicked(a)}
                className={`relative flex aspect-square min-h-11 w-full items-end justify-center overflow-hidden border-2 bg-panel p-0 ${!collapsed && a === angle ? 'border-ink' : 'border-rule'}`}
              >
                {p ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : null}
                <span className="relative bg-paper px-1 text-[0.625rem] font-bold uppercase tracking-wider">{done ? 'done' : a}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {collapsed ? (
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" className="btn" onClick={() => setPicked('front')}>
            Retake a side
          </button>
          {closeupControl}
        </div>
      ) : (
      <>
      <h2 className="mt-8 text-4xl font-bold uppercase leading-none tracking-wide">{TITLE[angle]}</h2>
      <p className="mt-1 text-ink-soft">
        {phase === 'pickup' ? 'Stand back so the whole item fits. Keep the light behind you.' : 'Take this side from the same spot as at pickup.'}
      </p>

      {guide ? (
        <div className="mt-4 max-w-xs">
          <PhotoWindow src={guide.url} alt={`Pickup photo, ${TITLE[angle]}`} caption="Pickup photo, same side" />
        </div>
      ) : null}
      <div role="status" className="mt-4 empty:hidden">
        {busy ? <p>Checking the photo…</p> : null}
        {photo && check ? (
          <>
            <PhotoWindow src={photo.url} alt={`${TITLE[angle]} photo`} caption={photo.source === 'sample' ? 'AI-generated demo photo' : undefined} />
            <CheckLine check={check} />
          </>
        ) : null}
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <input ref={input} type="file" accept="image/jpeg,image/*" capture="environment" className="sr-only" id="camera" tabIndex={-1} aria-hidden="true" onChange={(e) => onFile(e.target.files)} />
        <button type="button" className={allDone ? 'btn' : 'btn btn-primary'} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Checking the photo…' : photo ? `Retake ${TITLE[angle].toLowerCase()}` : `Take ${TITLE[angle].toLowerCase()} photo`}
        </button>
        {demoShop && sampleSet ? (
          <button type="button" className="btn" disabled={busy} onClick={() => void useSample()}>
            Use sample photo
          </button>
        ) : null}
        {mayKeepAnyway ? (
          <button type="button" className="btn" disabled={busy} onClick={() => void useAnyway()}>
            Use anyway
          </button>
        ) : null}
        {closeupControl}
      </div>
      </>
      )}
      <ErrorLine message={error} />
    </section>
  );
}

function CheckLine({ check }: { check: PhotoCheck }) {
  if (isNotChecked(check.reason)) {
    return <p className="mt-2 font-semibold text-stamp-review">Not checked by AI</p>;
  }
  return (
    <div className="mt-2">
      <p className={check.usable || check.overridden ? '' : 'font-semibold text-stamp-charged'}>
        {check.usable ? 'Photo accepted.' : check.overridden ? 'Photo kept by the shop.' : 'This photo cannot be used.'} {check.reason}
      </p>
      <AiLabel />
      <RecordedAiNote answer={check} />
    </div>
  );
}
