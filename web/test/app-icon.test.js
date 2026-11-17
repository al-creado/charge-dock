// Checks the Android launcher icon resources (kept here so CI runs it with the page tests).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const res = path.resolve(__dirname, '..', '..', 'app', 'src', 'main', 'res');
const read = f => fs.readFileSync(path.join(res, f), 'utf8');

// Every dot is drawn as "M cx-r,cy a r,r 0 1,0 2r,0 a r,r 0 1,0 -2r,0".
const dots = xml => [...xml.matchAll(/M([\d.]+),([\d.]+)a([\d.]+),[\d.]+ 0 1 ?,?0 ?[\d.]+,0a[\d.]+,[\d.]+ 0 1 ?,?0 ?-[\d.]+,0/g)]
  .map(m => ({ cx: Number(m[1]) + Number(m[3]), cy: Number(m[2]), r: Number(m[3]) }));
const group = (xml, color) => { const m = new RegExp(`fillColor="${color}"\\s+android:pathData="([^"]+)"`, 'i').exec(xml); return m ? dots(m[1]) : []; };

test('adaptive icon has a background, foreground and a themed (monochrome) layer', () => {
  const xml = read('mipmap-anydpi/ic_launcher.xml');
  assert.match(xml, /<background android:drawable="@color\/ic_launcher_background"/);
  assert.match(xml, /<foreground android:drawable="@drawable\/ic_launcher_foreground"/);
  assert.match(xml, /<monochrome android:drawable="@drawable\/ic_launcher_monochrome"/);
  assert.match(read('values/colors.xml'), /ic_launcher_background">#000000</);
});

test('foreground is a dotted clock face: 11 white dots, one Nothing-red dot at 12, and a dot colon', () => {
  const xml = read('drawable/ic_launcher_foreground.xml');
  const red = group(xml, '#D71921'), white = group(xml, '#F4F3F0');
  assert.equal(red.length, 1, 'one red dot');
  assert.deepEqual([red[0].cx, red[0].cy < 54], [54, true], 'the red dot is straight above the centre');
  assert.equal(white.length, 13, '11 hour dots plus 2 colon dots');
  assert.equal(white.filter(d => d.cx === 54 && Math.abs(d.cy - 54) < 10).length, 2, 'colon dots sit on the centre line');
});

test('every dot stays inside the launcher safe zone so no mask ever clips it', () => {
  for (const f of ['drawable/ic_launcher_foreground.xml', 'drawable/ic_launcher_monochrome.xml']) {
    const all = dots(read(f));
    assert.ok(all.length >= 14, `${f} has dots`);
    for (const d of all) {
      const reach = Math.hypot(d.cx - 54, d.cy - 54) + d.r;
      assert.ok(reach <= 33, `${f}: dot at ${d.cx},${d.cy} reaches ${reach.toFixed(1)} from the centre (limit 33)`);
    }
  }
});

test('monochrome layer has the same dots in one colour', () => {
  const mono = read('drawable/ic_launcher_monochrome.xml');
  assert.equal(dots(mono).length, dots(read('drawable/ic_launcher_foreground.xml')).length);
  assert.equal(new Set([...mono.matchAll(/fillColor="([^"]+)"/g)].map(m => m[1])).size, 1, 'a single fill colour');
});
