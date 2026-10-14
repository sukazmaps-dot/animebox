import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
const files=[];
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())walk(p);else if(p.endsWith('.css'))files.push(p)}}
walk('app');walk('components');
const retired=new Set(['050a14','07101d','0b1524','0e1b2d','6c5cff','5b7cff','19b7ff','795cff','7c68ee','9278ff','0c111a','121827','090d16','4c92f0','7053df','111827']);
const declared=new Set(),references=new Set(),failures=[];
for(const file of files){postcss.parse(fs.readFileSync(file,'utf8'),{from:file}).walkDecls(d=>{
 if(d.prop.startsWith('--ab-ui-'))declared.add(d.prop);
 for(const m of d.value.matchAll(/var\((--ab-ui-[\w-]+)/g))references.add(m[1]);
 const selector=d.parent.selector||'';
 // These are authored artwork, prize metals or explicit user theme presets.
 if(/FrameOverlay|SeasonFramePreview|PremiumParticleLayer/.test(file)||/premium-profile-theme--|particle|petal|sparkle|crown|medal|podiumCard\[data-rank|data-(theme|atmosphere|profile-theme)=/.test(selector)||d.prop==='filter')return;
 for(const m of d.value.matchAll(/#([a-f\d]{6})(?:[a-f\d]{2})?\b/gi))if(retired.has(m[1].toLowerCase()))failures.push(`${file} ${selector}: retired ${m[0]}`);
})}
for(const name of references)if(!declared.has(name))failures.push(`undefined UI token ${name}`);
assert.deepEqual(failures,[]);
const preview=fs.readFileSync('components/profile/ProfilePreview.tsx','utf8');
assert(preview.includes("data.premium ? data.primaryColor : 'var(--ab-ui-surface)'"));
assert(preview.includes("data.premium ? data.textColor : 'var(--ab-ui-text)'"));
console.log(`PASS: ${files.length} CSS files parsed; retired UI palette absent, ${references.size} semantic tokens resolved, ordinary/Premium preview palettes separated.`);
