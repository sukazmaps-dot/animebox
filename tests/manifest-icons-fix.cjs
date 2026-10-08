const assert = require('node:assert/strict');
const fs = require('node:fs');
const zlib = require('node:zlib');
const ts = require('typescript');
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function validatePng(bytes) {
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  let cursor = 8, ended = false, width, height, depth, color, interlace;
  const data = [];
  while (cursor < bytes.length) {
    assert.ok(cursor + 12 <= bytes.length, 'truncated PNG chunk');
    const size = bytes.readUInt32BE(cursor), end = cursor + size + 12;
    assert.ok(end <= bytes.length, 'truncated PNG data');
    const type = bytes.toString('ascii',cursor+4,cursor+8);
    assert.equal(crc32(bytes.subarray(cursor+4,end-4)),bytes.readUInt32BE(end-4),'invalid PNG CRC');
    if(type==='IHDR'){width=bytes.readUInt32BE(cursor+8);height=bytes.readUInt32BE(cursor+12);depth=bytes[cursor+16];color=bytes[cursor+17];interlace=bytes[cursor+20];}
    if(type==='IDAT')data.push(bytes.subarray(cursor+8,end-4));
    cursor=end;
    if(type==='IEND'){ended=true;break;}
  }
  assert.ok(ended && cursor===bytes.length, 'missing IEND or trailing corrupt data');
  assert.equal(depth,8);assert.equal(interlace,0);
  const channels={0:1,2:3,3:1,4:2,6:4}[color];assert.ok(channels);
  const decoded=zlib.inflateSync(Buffer.concat(data),{maxOutputLength:16*1024*1024});
  assert.equal(decoded.length,height*(1+width*channels));
  return {width,height};
}
const png=fs.readFileSync('public/brand/favicon.png');
assert.deepEqual(validatePng(png),{width:512,height:512});
assert.throws(()=>validatePng(png.subarray(0,png.length-7)),'IHDR signature is not proof of a valid icon');
const mod={exports:{}};
new Function('exports','module',ts.transpileModule(fs.readFileSync('app/manifest.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod.exports,mod);
const manifest=mod.exports.default();
const icon=manifest.icons.find(icon=>icon.type==='image/png');
assert.equal(icon.sizes,'512x512');assert.match(icon.src,/v=20261008/);
for(const icon of manifest.icons) assert.ok(fs.existsSync('public'+icon.src.split('?')[0]));
const webp=fs.readFileSync('public/brand/brand-mark.webp');
assert.equal(webp.toString('ascii',0,4),'RIFF');assert.equal(webp.readUInt32LE(4)+8,webp.length);assert.equal(webp.toString('ascii',8,12),'WEBP');
assert.equal(webp.toString('ascii',12,16),'VP8X');
assert.deepEqual({width:webp.readUIntLE(24,3)+1,height:webp.readUIntLE(27,3)+1},{width:192,height:192});
assert.equal(manifest.icons.find(icon=>icon.type==='image/webp').sizes,'192x192');
console.log('PASS: full PNG chunks/CRC/IDAT/IEND, damaged PNG rejection and manifest file/MIME/dimensions consistency');
