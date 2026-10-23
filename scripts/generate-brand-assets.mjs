import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const mark = JSON.parse(await readFile(new URL('shared/brand-mark.json', root), 'utf8'));
const paths = mark.paths.map(path => `<path d="${path.d}"/>`).join('');
const svg = (content, viewBox = mark.viewBox) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><title>Animate Studio - ${mark.name}</title>${content}</svg>\n`;
const symbol = color => svg(`<g fill="${color}">${paths}</g>`);
const tile = (rounded = true, maskable = false) => svg(
  `<rect width="64" height="64"${rounded ? ' rx="14"' : ''} fill="${mark.ink}"/><g fill="${mark.paper}"${maskable ? ' transform="translate(8 8) scale(.75)"' : ''}>${paths}</g>`,
);
const lockup = (color, secondary) => svg(
  `<g transform="translate(0 16)" fill="${color}">${paths}</g><text x="82" y="62" fill="${color}" font-family="Arial,Helvetica,sans-serif" font-size="42" font-weight="700" letter-spacing="-1.6">animate<tspan font-weight="400" fill="${secondary}" dx="5">studio</tspan></text>`,
  '0 0 400 96',
);

await mkdir(new URL('public/brand/', root), { recursive: true });
const sources = {
  'brand/mark.svg': symbol(mark.ink),
  'brand/mark-inverse.svg': symbol(mark.paper),
  'brand/app-icon.svg': tile(),
  'brand/lockup.svg': lockup(mark.ink, '#65656C'),
  'brand/lockup-inverse.svg': lockup(mark.paper, '#B9B9BF'),
  'favicon.svg': tile(),
};
for (const [name, content] of Object.entries(sources)) {
  await writeFile(new URL(`public/${name}`, root), content);
}
async function png(content, size, path) {
  await sharp(Buffer.from(content)).resize(size, size).png().toFile(fileURLToPath(new URL(`public/${path}`, root)));
}
await Promise.all([
  png(symbol(mark.ink), 512, 'brand/mark.png'),
  png(symbol(mark.paper), 512, 'brand/mark-inverse.png'),
  png(tile(), 1024, 'brand/app-icon.png'),
  png(tile(), 192, 'brand/icon-192.png'),
  png(tile(), 512, 'brand/icon-512.png'),
  png(tile(false, true), 512, 'brand/icon-maskable-512.png'),
  png(tile(false), 180, 'apple-touch-icon.png'),
  ...[16, 32, 48].map(size => png(tile(), size, `brand/favicon-${size}.png`)),
]);

// A multi-resolution ICO using PNG frames; no font or proprietary image input.
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map(size => sharp(Buffer.from(tile())).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const pos = 6 + index * 16;
  header[pos] = sizes[index]; header[pos + 1] = sizes[index];
  header.writeUInt16LE(1, pos + 4); header.writeUInt16LE(32, pos + 6);
  header.writeUInt32LE(frame.length, pos + 8); header.writeUInt32LE(offset, pos + 12);
  offset += frame.length;
});
await writeFile(new URL('public/favicon.ico', root), Buffer.concat([header, ...frames]));
await writeFile(new URL('public/site.webmanifest', root), JSON.stringify({
  id: '/', name: 'Animate Studio', short_name: 'Animate Studio', lang: 'zh-CN',
  description: '通过拖拽组件，构建有生命力的页面。',
  start_url: '/', scope: '/', display: 'standalone',
  background_color: mark.paper, theme_color: mark.paper,
  icons: [
    { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2) + '\n');
const boardMark = (x, y, size, color = mark.ink) => `<g transform="translate(${x} ${y}) scale(${size / 64})" fill="${color}">${paths}</g>`;
const boardText = (x, y, text, size = 14, color = '#77777D', extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${text}</text>`;
const grid = Array.from({ length: 9 }, (_, i) => {
  const pos = i * 32;
  return `<path d="M${124 + pos} 604V860M124 ${604 + pos}H380" stroke="#E4E4E1" stroke-width="1"/>`;
}).join('');
const sizeSamples = [16, 24, 32, 48, 64].map((size, i) => {
  const x = [548, 610, 676, 748, 832][i], y = 650 - size / 2;
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 14 / 64}" fill="${mark.ink}"/>${boardMark(x, y, size, mark.paper)}${boardText(x + size / 2, 722, String(size), 12, '#77777D', 'text-anchor="middle"')}`;
}).join('');
const board = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1000" viewBox="0 0 1440 1000">
<rect width="1440" height="1000" fill="${mark.paper}"/>
<g font-family="Arial,Helvetica,sans-serif">
${boardText(64, 61, 'ANIMATE STUDIO', 13, mark.ink, 'font-weight="700" letter-spacing="2"')}
${boardText(1376, 61, 'VISUAL IDENTITY / 01', 12, '#77777D', 'text-anchor="end" letter-spacing="1.6"')}
<path d="M64 86H1376" stroke="#DADAD7"/>
${boardMark(88, 162, 192)}
${boardText(336, 266, 'animate<tspan font-weight="400" fill="#65656C" dx="8">studio</tspan>', 76, mark.ink, 'font-weight="700" letter-spacing="-3"')}
${boardText(340, 311, 'Design in frames. Create in motion.', 19, '#77777D')}
<rect x="1096" y="144" width="248" height="248" rx="54" fill="${mark.ink}"/>
${boardMark(1096, 144, 248, mark.paper)}
${boardText(88, 421, '跃帧 / KEYFRAME A', 17, mark.ink, 'font-weight="700" letter-spacing=".6"')}
${boardText(1344, 421, 'Drawn for Animate Studio · 2026.10.23', 13, '#77777D', 'text-anchor="end"')}
<path d="M64 476H1376M496 530V924M960 530V924" stroke="#DADAD7"/>
${boardText(64, 540, '01 / THE CONSTRUCTION', 13, mark.ink, 'font-weight="700" letter-spacing="1"')}
${boardText(64, 569, '64-unit grid · 12-unit body · 20-unit keyframe', 13)}
${grid}${boardMark(124, 604, 256)}
${boardText(64, 904, 'Two authored paths. One shared geometry.', 13)}
${boardText(528, 540, '02 / AT EVERY SCALE', 13, mark.ink, 'font-weight="700" letter-spacing="1"')}
${boardText(528, 569, 'Favicon, app icon and monochrome signature', 13)}
${sizeSamples}
<rect x="528" y="764" width="400" height="112" rx="16" fill="${mark.ink}"/>
${boardMark(552, 796, 48, mark.paper)}
${boardText(616, 828, 'animate<tspan font-weight="400" fill="#B9B9BF" dx="4">studio</tspan>', 30, mark.paper, 'font-weight="700" letter-spacing="-1"')}
${boardText(528, 904, 'Dark and light. The same silhouette.', 13)}
${boardText(992, 540, '03 / IN THE WORKBENCH', 13, mark.ink, 'font-weight="700" letter-spacing="1"')}
${boardText(992, 569, 'A quiet identity for a creative tool', 13)}
<rect x="992" y="604" width="384" height="272" rx="14" fill="#FFF" stroke="#DDDDDA"/>
${boardMark(1008, 618, 32)}
${boardText(1046, 642, 'animate<tspan font-weight="400" fill="#65656C"> studio</tspan>', 18, mark.ink, 'font-weight="700" letter-spacing="-.6"')}
<rect x="1300" y="624" width="58" height="22" rx="5" fill="${mark.ink}"/>
${boardText(1329, 639, 'Preview', 10, mark.paper, 'text-anchor="middle"')}
<path d="M992 664H1376M1082 664V876" stroke="#E5E5E2"/>
<rect x="1008" y="684" width="57" height="5" rx="2.5" fill="#B7B7BC"/>
<rect x="1008" y="710" width="27" height="29" rx="4" fill="#F1F1EF"/><rect x="1041" y="710" width="27" height="29" rx="4" fill="#F1F1EF"/>
<rect x="1008" y="751" width="27" height="29" rx="4" fill="#F1F1EF"/><rect x="1041" y="751" width="27" height="29" rx="4" fill="#F1F1EF"/>
<rect x="1008" y="792" width="27" height="29" rx="4" fill="#F1F1EF"/><rect x="1041" y="792" width="27" height="29" rx="4" fill="#F1F1EF"/>
<rect x="1104" y="690" width="249" height="159" rx="5" fill="#FAFAF8" stroke="#E7E7E3"/>
<rect x="1127" y="716" width="128" height="8" rx="4" fill="${mark.ink}"/>
<rect x="1127" y="739" width="199" height="4" rx="2" fill="#B7B7BC"/><rect x="1127" y="750" width="165" height="4" rx="2" fill="#D2D2D4"/>
<rect x="1127" y="776" width="74" height="26" rx="5" fill="${mark.ink}"/>
${boardText(1164, 793, 'Create', 11, mark.paper, 'text-anchor="middle"')}
${boardText(992, 904, 'Header, loading state and app icon.', 13)}
<path d="M64 944H1376" stroke="#DADAD7"/>
${boardText(64, 976, 'VECTOR MASTER / shared/brand-mark.json', 11, '#77777D', 'letter-spacing=".6"')}
${boardText(1376, 976, 'SVG · PNG · ICO · WEB MANIFEST', 11, '#77777D', 'text-anchor="end" letter-spacing=".6"')}
</g></svg>`;
await writeFile(new URL('docs/brand-board.svg', root), board + '\n');
await sharp(Buffer.from(board)).png().toFile(fileURLToPath(new URL('docs/brand-board.png', root)));
console.log('Generated Keyframe A SVG, PNG, ICO, Apple touch icon, web manifest, and brand board.');
