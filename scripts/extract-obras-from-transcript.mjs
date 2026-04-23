import fs from 'fs';
const p =
  'C:/Users/Asus/.cursor/projects/c-Users-Asus-OneDrive-Escritorio-Programacion-Tinnto-ARCA/agent-transcripts/980c0420-a825-470b-a299-2d13aae2b041/980c0420-a825-470b-a299-2d13aae2b041.jsonl';
const line = fs.readFileSync(p, 'utf8').split('\n')[0];
const j = JSON.parse(line);
const full = j.message.content[0].text;
const start = full.indexOf('name="cbobrasocial"');
const sub = full.slice(start, start + 500000);
const endSel = sub.indexOf('</select>');
const html = sub.slice(0, endSel);
const re = /<option value="([^"]+)">([^<]*)<\/option>/g;
const rows = [];
let m;
while ((m = re.exec(html)) !== null) {
  const v = m[1];
  const t = m[2].replace(/&nbsp;/g, ' ').trim();
  if (v === '' || v === '-1' || v === '-2') continue;
  if (!/^\d+$/.test(v)) continue;
  rows.push({ codigo: v, nombre: t });
}
// Dedupe by codigo (keep first)
const seen = new Set();
const unique = rows.filter((r) => {
  if (seen.has(r.codigo)) return false;
  seen.add(r.codigo);
  return true;
});
console.log('count', unique.length);
fs.writeFileSync(
  new URL('./obras-sociales-parsed.json', import.meta.url),
  JSON.stringify(unique, null, 0)
);
