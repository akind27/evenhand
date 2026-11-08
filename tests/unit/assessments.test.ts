import { describe, expect, it } from 'vitest';
import type { StoredEvent } from '@/lib/domain/events';
import { aiAssessments } from '@/lib/evidence/assessments';

const entry = (seq: number, event: StoredEvent['event']): StoredEvent => ({ seq, at: '2026-11-08T10:00:00Z', actor: 'system', event, prevHash: '0', hash: '1' });

describe('aiAssessments', () => {
  it('lists each AI step with its model and skips steps without an assessment', () => {
    const lines = aiAssessments([
      entry(0, { type: 'photoChecked', photoId: 'p', usable: true, reason: 'ok', overridden: false, assessmentId: 'a1', model: 'claude-opus-5-5' }),
      entry(1, { type: 'conditionRecorded', marks: [], suggestedRuleId: null, itemDescription: 'x', assessmentId: 'a2', model: 'claude-opus-5-5' }),
      entry(2, { type: 'conditionRecorded', marks: [], suggestedRuleId: null, itemDescription: '', assessmentId: null }),
      entry(3, { type: 'comparisonDone', findings: [], explanation: '', explanationLanguage: 'en', assessmentId: 'a3', aiFailed: false }),
      entry(4, { type: 'closed' }),
    ]);
    expect(lines).toEqual([
      { seq: 0, kind: 'photoCheck', assessmentId: 'a1', model: 'claude-opus-5-5' },
      { seq: 1, kind: 'condition', assessmentId: 'a2', model: 'claude-opus-5-5' },
      { seq: 3, kind: 'comparison', assessmentId: 'a3', model: null },
    ]);
  });
});
