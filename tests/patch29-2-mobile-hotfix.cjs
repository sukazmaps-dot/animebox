const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (file) => fs.readFileSync(file, 'utf8');

const page = read('app/anime/[slug]/page.tsx');
const layout = read('app/anime/[slug]/detail-layout.module.css');
const hub = read('components/watch-party/WatchTogetherHub.module.css');
const controls = read('components/AnimeDetailControls.tsx');

const actionElement = page.indexOf('<div className={layout.actions}>');
const descriptionElement = page.indexOf('<section className={layout.description}');
assert(actionElement >= 0 && descriptionElement > actionElement,
  'Cinematic action element must precede description in DOM');
assert(layout.includes('.actions { display: flow-root; position: relative;'),
  'Dedicated grid item and normal flow must be present');
assert(layout.includes('.actions :global(.anime-detail-actions) {'),
  'CSS module must own nested action layout');
assert(layout.includes('display: flex !important;') && layout.includes('flex-flow: row wrap !important;'),
  'Mobile action buttons should wrap naturally and reserve height');
assert(layout.includes('.actions :global(.anime-detail-actions__watch)') &&
  layout.includes('flex: 1 0 100% !important;'),
  'Watch action should occupy its own full-width row');
assert(layout.includes('.actions :global(.anime-detail-actions__favorite)') &&
  layout.includes('.actions :global(.anime-detail-actions__tracker)'),
  'Both circular action controls must be laid out in normal flow');
assert(layout.includes('height: auto !important;') && layout.includes('margin: 0 0 14px;'),
  'Action container must reserve real height and spacing');
assert(layout.includes('.description {') &&
  layout.includes('clear: both;'),
  'Synopsis must begin below the action block');
assert(controls.includes('aria-label={favorite ?') && controls.includes("aria-label={trackerBusy ?"),
  'Button accessibility labels remain in place');
assert(hub.includes('/* Patch 29.2: native-scale mobile hub'),
  'Watch Together mobile scope must be present');
assert(hub.includes('.page.page .publicRoomGrid,') &&
  hub.includes('.page.page .results { grid-template-columns: minmax(0, 1fr) !important;'),
  'Mobile lobbies and anime result cards must be one column');
assert(hub.includes('.page.page .cardCopy strong { font-size: 14px;'),
  'Anime card text needs readable mobile typography');
assert(hub.includes('.page.page .hero {') && hub.includes('grid-template-columns: minmax(0, 1fr) !important;'),
  'Mobile hero must stack the invite card');
assert(hub.includes('.page.page .joinInput button { width: 100%; min-width: 0; min-height: 44px;'),
  'Mobile invite input must remain usable');
console.log('Patch 29.2 PASS: cinematic action flow, synopsis separation and Watch Together mobile sizing.');
