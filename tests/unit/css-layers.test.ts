import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

/** The text of the first top-level block that starts with `opener`. */
function block(opener: string): string {
  const start = css.indexOf(opener);
  if (start < 0) {
    return '';
  }
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') {
      depth += 1;
    } else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return css.slice(start, i + 1);
      }
    }
  }
  return '';
}

describe('globals.css cascade layers (Tailwind 4 utilities live in a layer)', () => {
  const components = block('@layer components');

  it('puts every custom component class inside @layer components', () => {
    expect(components).not.toBe('');
    for (const selector of ['.doc-page', '.field-label', '.section-label', '.rule-top', '.btn {', '.btn-primary', '.btn-danger', '.action-bar', '.input', '.tick', '.stamp {', '.stamp-round']) {
      expect(components, selector).toContain(selector);
    }
  });

  it('keeps .mono out of the layer as a Tailwind utility', () => {
    expect(components).not.toContain('.mono');
    expect(css).toContain('@utility mono');
  });

  it('keeps the global rules and the motion outside the layer', () => {
    for (const piece of [':focus-visible', '@keyframes stamp-land', 'prefers-reduced-motion']) {
      expect(css).toContain(piece);
      expect(components).not.toContain(piece);
    }
  });
});
