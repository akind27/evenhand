// React cannot render an HTML comment, so the contract is the content of a hidden element.
const CONTRACT = `
THESIS: The handover record is a security document both sides hold; we refuse the fintech-card dashboard and the blue-dome holiday cliché.
OWN-WORLD: Cool security-paper ground, deep intaglio-blue ink, fine sea-green and violet guilloche rosettes behind records, visa-stamp status marks in violet, green, vermilion and ochre, a machine-readable strip of real fingerprints.
STORY: The shop photographs, the renter checks the same record on their own phone, PayPal stamps the hold; at return a stamp settles it, and both trust why.
FIRST VIEWPORT: Shop: the active handover as a document page, item and deposit large, one thumb-sized primary action at the bottom. Renter: the record page with the deposit line and the hold stamp.
FORM: passport security printing, candidate 4 of 7, seed key 39dd3aea.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
`;

/** The direction contract. Rendered first inside body by the layout (Next adds its own hidden element before it). The comment survives the build. */
export function DirectionContract() {
  return <div hidden dangerouslySetInnerHTML={{ __html: `<!--${CONTRACT}-->` }} />;
}
