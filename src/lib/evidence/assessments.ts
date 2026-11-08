import type { StoredEvent } from '@/lib/domain/events';

export interface AiAssessmentLine {
  seq: number;
  kind: 'photoCheck' | 'condition' | 'comparison';
  assessmentId: string;
  /** The model id, or null for events written before the model was recorded on the event. */
  model: string | null;
}

/** One line per AI assessment in the log: which step, which assessment, which model. Used in the evidence export. */
export function aiAssessments(events: StoredEvent[]): AiAssessmentLine[] {
  return events.flatMap((entry): AiAssessmentLine[] => {
    const event = entry.event;
    if (event.type !== 'photoChecked' && event.type !== 'conditionRecorded' && event.type !== 'comparisonDone') {
      return [];
    }
    if (event.assessmentId === null) {
      return [];
    }
    const kind = event.type === 'photoChecked' ? 'photoCheck' : event.type === 'conditionRecorded' ? 'condition' : 'comparison';
    return [{ seq: entry.seq, kind, assessmentId: event.assessmentId, model: event.model ?? null }];
  });
}
