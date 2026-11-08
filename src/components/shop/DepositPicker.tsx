'use client';
import { useState } from 'react';
import { ErrorLine } from '@/components/doc/DocParts';
import { errorMessage, setDeposit, type HandoverView } from '@/lib/client/api';
import { euro } from '@/lib/client/format';

/** Deposit options from the shop's own rules for this item type. The suggestion is only a hint. */
export function DepositPicker({ view, onChange }: { view: HandoverView; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matching = view.depositRules.filter((rule) => rule.itemType === view.itemType);
  const rules = matching.length > 0 ? matching : view.depositRules;

  async function choose(ruleId: string) {
    setBusy(true);
    setError(null);
    try {
      await setDeposit(view.id, ruleId);
      onChange();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {view.deposit ? <p className="mono text-4xl font-medium">{euro(view.deposit.amountCents)}</p> : null}
      <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
        {rules.map((rule) => {
          const chosen = view.deposit?.ruleId === rule.id;
          return (
            <li key={rule.id}>
              <button
                type="button"
                aria-pressed={chosen}
                disabled={busy}
                onClick={() => void choose(rule.id)}
                className={`btn w-full justify-between ${chosen ? 'bg-ink text-paper hover:bg-ink' : ''}`}
              >
                <span>
                  {rule.label}
                  {view.suggestedRuleId === rule.id ? ' · suggested' : ''}
                </span>
                <span className="mono">{euro(rule.amountCents)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {rules.length === 0 ? <p>This shop has no deposit rules yet. Add one in the shop settings.</p> : null}
      <ErrorLine message={error} />
    </div>
  );
}
