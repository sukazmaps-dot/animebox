const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { createHash } = require('node:crypto');

function load(path, imports) {
  const source = fs.readFileSync(path, 'utf8');
  const js = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });
  assert.equal(js.diagnostics?.length ?? 0, 0, path + ': transpile diagnostics');
  const moduleRef = { exports: {} };
  new Function('require', 'module', 'exports', js.outputText)(
    name => {
      if (name === 'node:crypto') return { createHash };
      if (name in imports) return imports[name];
      throw new Error('unexpected module ' + name);
    },
    moduleRef, moduleRef.exports,
  );
  return moduleRef.exports;
}

const rows = [
  { id:21175,slug:'dragon-ball-super-21175',title:'Драконий жемчуг: Супер',
    poster_url:'https://media.youranimebox.com/db.jpg',genres:['Action'],
    total_episodes:131,finished:true,start_year:2015,format:'TV' },
  { id:6,slug:'trigun',title:'Триган',poster_url:null,
    genres:['Action'],total_episodes:26,finished:true,start_year:1998,format:'TV' },
  { id:13,slug:'third-series-13',title:'Third Series',
    poster_url:'https://media.youranimebox.com/13.webp',genres:[],
    total_episodes:null,finished:false,start_year:null,format:'TV' },
  { id:14,slug:'bad/../slug',title:'Untrusted',poster_url:'https://cdn.test/14.jpg',
    genres:['Action'],total_episodes:12,finished:true,start_year:2019,format:'TV' },
  { id:15,slug:'anime-15',title:'Без названия',poster_url:'https://cdn.test/15.jpg',
    genres:[],total_episodes:12,finished:false,start_year:null,format:null },
  { id:16,slug:'sixteen',title:'Valid anime',poster_url:null,
    genres:[],total_episodes:null,finished:false,start_year:null,format:null },
  { id:17,slug:'seventeen',title:'With poster',poster_url:'http://unsafe.test/image.jpg',
    genres:[],total_episodes:null,finished:false,start_year:null,format:null },
  { id:-1,slug:'negative',title:'Invalid',poster_url:'https://cdn.test/1.jpg',
    genres:[],total_episodes:null,finished:true,start_year:null,format:null },
];
const stored = new Map([
  [6,{anime_id:6,slug:'trigun',title:'Complete AniList record',source_shard:5,indexable:true}],
  [13,{anime_id:13,slug:'third-series-13',source_shard:-1,indexable:false}],
]);
let race = false;
const calls = { reads:0, lookups:0, upserts:0, count:0, ranges:[] };
const admin = {
  from(table) {
    if (table === 'anime_catalog') return {
      select(_cols,options) {
        if (options?.head) {
          calls.count++;
          return Promise.resolve({count:rows.length,error:null});
        }
        return {order(col) {
          assert.equal(col,'id');
          return {range(from,to) {
            calls.reads++;
            calls.ranges.push({from,to});
            return Promise.resolve({data:rows.slice(from,to+1),error:null});
          }};
        }};
      },
    };
    if (table !== 'seo_anime_index') throw Error('unknown table '+table);
    return {
      select(col) {
        assert.equal(col,'anime_id');
        return {in(key,ids) {
          assert.equal(key,'anime_id');
          calls.lookups++;
          assert(ids.length <= 120,'no N+1 queries');
          return Promise.resolve({data:ids.flatMap(id=>stored.has(id)?[{anime_id:id}]:[]),error:null});
        }};
      },
      upsert(batch,options) {
        calls.upserts++;
        assert.equal(options.onConflict,'anime_id');
        assert.equal(options.ignoreDuplicates,true,
          'concurrent or already indexed titles must never be overwritten');
        assert(batch.length <= 120);
        if (race) {
          stored.set(21175,{anime_id:21175,slug:'existing-anilist-canonical',source_shard:31});
          race=false;
        }
        const created=[];
        for (const record of batch) {
          if (stored.has(record.anime_id)) continue;
          stored.set(record.anime_id,record);
          created.push({anime_id:record.anime_id,slug:record.slug});
        }
        return {select() { return Promise.resolve({data:created,error:null}); }};
      },
    };
  },
};
const imports = {
  'server-only': {},
  '@/lib/anime-seo': {
    shouldIndexAnime: a=>a.catalogEligible!==false&&Number.isSafeInteger(a.id)&&a.id>0&&Boolean(a.title?.russian),
    animeSeoQualityScore:a=>[a.episodes,a.startDate?.year,a.genres?.length,a.coverImage?.large].filter(Boolean).length,
  },
  '@/lib/seo-config': {ANIME_SITEMAP_SHARDS:70},
  '@/lib/supabase/admin': {createSupabaseAdmin:()=>admin},
};

async function main() {
  const api = load('lib/seo-catalog-recovery-server.ts',imports);
  assert.equal(api.SEO_CATALOG_RECOVERY_PAGE_SIZE,120);
  assert.equal(api.parseSeoCatalogRecoveryRow(rows[0]).anime.id,21175);
  assert.equal(api.parseSeoCatalogRecoveryRow(rows[1]).slug,'trigun');
  for (const i of [3,4,5,6,7]) {
    assert.equal(api.parseSeoCatalogRecoveryRow(rows[i]),null,
      'invalid/insufficient catalogue evidence must fail closed: '+i);
  }
  const count = await api.getSeoCatalogRepairPageCount();
  assert.equal(count,1);
  assert.equal(api.scheduledSeoCatalogRepairPage(1,Date.UTC(2026,9,15)),0);
  assert.equal(api.scheduledSeoCatalogRepairPage(0),0);
  await assert.rejects(api.repairSeoCatalogPage({page:-1}),/invalid/);
  await assert.rejects(api.repairSeoCatalogPage({page:10000}),/invalid/);
  const dry=await api.repairSeoCatalogPage({page:0,dryRun:true});
  assert.equal(dry.scanned,rows.length);
  assert.equal(dry.eligible,3);
  assert.equal(dry.rejected,rows.length-3);
  assert.equal(dry.alreadyInRegistry,2);
  assert.equal(dry.attempted,1);
  assert.equal(dry.inserted,0);
  assert.equal(calls.upserts,0,'dry run must never mutate database');

  race=true;
  const conflict=await api.repairSeoCatalogPage({page:0});
  assert.equal(conflict.inserted,0,'concurrent canonical record cannot be replaced');
  assert.equal(stored.get(21175).slug,'existing-anilist-canonical');
  stored.delete(21175);

  const commit=await api.repairSeoCatalogPage({page:0});
  assert.equal(commit.inserted,1);
  assert.deepEqual(commit.insertedSlugs,['dragon-ball-super-21175']);
  assert.equal(stored.get(21175).sitemap_shard,21175 % 70);
  assert.equal(stored.get(21175).source_shard,-1);
  assert.equal(stored.get(21175).indexable,true);
  assert.match(stored.get(21175).content_fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(stored.get(6).title,'Complete AniList record','existing richer row preserved');
  assert.equal(stored.get(13).indexable,false,'existing noindex row preserved');
  const repeated=await api.repairSeoCatalogPage({page:0});
  assert.equal(repeated.inserted,0,'idempotent');

  const empty=await api.repairSeoCatalogPage({page:1});
  assert.equal(empty.inserted,0);
  assert.equal(empty.scanned,0);
  assert(calls.ranges.every(v=>v.to-v.from+1===120));
  assert(calls.lookups<=5, 'one batched lookup per non-empty page');

  const cron=fs.readFileSync('app/api/cron/seo-anime-index/route.ts','utf8');
  const title=fs.readFileSync('app/anime/[slug]/page.tsx','utf8');
  const episode=fs.readFileSync('lib/episode-seo.ts','utf8');
  const robots=fs.readFileSync('app/login/layout.tsx','utf8');
  assert(cron.includes('isSeoCronAuthorized(request)'));
  assert(cron.indexOf('if (!isSeoCronAuthorized(request))')<
    cron.indexOf('repairSeoCatalogPage({'),'cron auth must precede writes');
  assert(cron.includes('beginOperationalJob('));
  assert(cron.includes('catalogRecovery'));
  assert(cron.includes('dryRun: catalogRepair.dryRun'));
  assert(cron.includes('requestedShard(request)'),'old shards retained');
  assert(episode.includes('getSeoEpisodeIndexEntry(animeId, episode)'),
    'confirmed episode status retained');
  assert(title.includes('getResolvedAnime(slug)'),'title resolution unchanged');
  assert(/index:\s*false/.test(robots),'login noindex unchanged');

  console.log('PASS Patch 30.5: authoritative ID, slug and quality gate, ignore-duplicates race, dry-run, page cap, existing indexability and cron authorization.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
