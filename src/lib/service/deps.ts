import type { VisionAssessor } from '@/lib/ai/assessor';
import type { EvidenceStore } from '@/lib/evidence/store';
import type { PaymentsGateway } from '@/lib/payments/gateway';

export interface ServiceDeps {
  store: EvidenceStore;
  payments: PaymentsGateway;
  ai: VisionAssessor;
  now: () => Date;
  newId: () => string;
}
