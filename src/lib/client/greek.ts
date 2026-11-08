/**
 * Greek capitals carry no tonos (the acute accent), but they keep the dialytika (diaeresis):
 * προϊόν becomes ΠΡΟΪΟΝ. CSS `text-transform: uppercase` alone is not reliable for this, so labels are upper-cased here.
 * Only the combining acute (U+0301) on a Greek letter is removed; an acute and a diaeresis together on one letter
 * become a plain diaeresis. Accents on other scripts (café) are left alone.
 */
export function greekUpper(text: string): string {
  const bare = text
    .normalize('NFD')
    .replace(/([Ͱ-Ͽ])([̀-ͯ]+)/gu, (_match, letter: string, marks: string) => letter + marks.replace(/́/g, ''));
  return bare.normalize('NFC').toLocaleUpperCase('el');
}
