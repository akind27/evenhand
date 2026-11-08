const LINE_WIDTH = 44;
/** The width of one character of the mono face, in em. Used to size the strip so a whole line fits its box. */
const ADVANCE_EM = 0.72;

interface MachineStripProps {
  id: string;
  itemRef: string;
  depositCents: number | null;
  status: string;
  lastHash: string;
}

/** Uppercase, with spaces and anything odd turned into the `<` filler. Never adds characters of its own. */
function clean(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9_-]/g, '<');
}

function pad(line: string, width: number): string {
  return line.length >= width ? line : line + '<'.repeat(width - line.length);
}

/** The two lines of the strip. Every value comes from the record; nothing is invented. */
export function machineLines(props: MachineStripProps): [string, string] {
  const first = `EH<<HANDOVER<<<${clean(props.id)}<<<${clean(props.itemRef)}<<<`;
  const deposit = props.depositCents === null ? '' : String(props.depositCents);
  const second = `${deposit}EUR<${clean(props.status)}<${clean(props.lastHash.slice(0, 16))}<<<`;
  const width = Math.max(LINE_WIDTH, first.length, second.length);
  return [pad(first, width), pad(second, width)];
}

/** Like the machine-readable zone of a passport. Sits at the foot of every record. */
export function MachineStrip(props: MachineStripProps) {
  const lines = machineLines(props);
  const full = `Machine-readable strip of this record: ${lines.join(' ')}`;
  // The text is sized from the width of its box (a container query), so a whole line always fits, even on a phone.
  const fit = `min(0.6875rem, calc(100cqw / ${(lines[0].length * ADVANCE_EM).toFixed(2)}))`;
  return (
    <div className="mt-10 [container-type:inline-size]">
      <div
        role="note"
        aria-label={full}
        title={full}
        className="mono overflow-hidden border-y border-rule py-2 leading-5 tracking-normal text-ink-soft"
        style={{ fontSize: fit }}
      >
        {lines.map((line, index) => (
          <div key={index} aria-hidden="true" className="overflow-hidden whitespace-pre text-clip">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
