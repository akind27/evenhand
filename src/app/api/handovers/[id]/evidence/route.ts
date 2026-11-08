import { verifyChain, type StoredEvent } from '@/lib/domain/events';
import { aiAssessments } from '@/lib/evidence/assessments';
import { ok, respond } from '@/lib/http';
import { authorize, type IdContext } from '@/lib/route-auth';

export async function GET(req: Request, ctx: IdContext): Promise<Response> {
  return respond(async () => {
    const { id } = await ctx.params;
    const { service, state, view } = await authorize(req, id, null);
    const events = await service.getEvents(state.id);
    const photos = [...state.pickupPhotos, ...state.returnPhotos].map((photo) => ({
      id: photo.id,
      angle: photo.angle,
      phase: photo.phase,
      sha256: photo.sha256,
      url: photo.url,
    }));
    // The chain is checked on the full log. Only then are the credential hashes hidden.
    const chain = verifyChain(events);
    return ok({
      handover: view(state),
      events: events.map(redactEvent),
      chain,
      assessments: aiAssessments(events),
      note: 'Credential hashes are redacted; the chain was verified by the server.',
      photos,
    });
  });
}

/**
 * A copy of the event with its credential hashes replaced: the token and view-key hashes of `created`,
 * and the device hash of `renterConfirmed`. The stored event is not changed.
 */
function redactEvent(entry: StoredEvent): StoredEvent {
  if (entry.event.type === 'created') {
    return { ...entry, event: { ...entry.event, renterTokenHash: 'redacted', viewKeyHash: 'redacted' } };
  }
  if (entry.event.type === 'renterConfirmed' && entry.event.renterDeviceHash !== undefined) {
    return { ...entry, event: { ...entry.event, renterDeviceHash: 'redacted' } };
  }
  return entry;
}
