// Default converter icons, fetched at runtime from the Iconify API
// (https://api.iconify.design) through our server proxy and cached. Each URL
// bakes in a color so icons look good out of the box; renderIcon()/hydrate
// inline them as data URIs (COEP-safe) and monochrome tinting still applies.

const ICONIFY = 'https://api.iconify.design';

function mdi(name: string, color: string): string {
  return `${ICONIFY}/mdi/${name}.svg?color=${encodeURIComponent(color)}`;
}

const palette = {
  image: '#38bdf8',
  audio: '#4ade80',
  video: '#f472b6',
  document: '#818cf8',
  archive: '#f97316',
  text: '#a78bfa',
  plugin: '#00d4aa',
  download: '#ffd166',
};

export const svgIcons = {
  image: mdi('file-image', palette.image),
  audio: mdi('music-note', palette.audio),
  video: mdi('film', palette.video),
  document: mdi('file-document', palette.document),
  archive: mdi('archive', palette.archive),
  text: mdi('file-text', palette.text),
  plugin: mdi('puzzle', palette.plugin),
  download: mdi('download', palette.download),
};

export function svgIconForExt(ext: string): string {
  const e = ext.toLowerCase();
  const map: Record<string, string> = {
    png: mdi('file-image', palette.image),
    jpg: mdi('file-image', palette.image),
    jpeg: mdi('file-image', palette.image),
    webp: mdi('file-image', palette.image),
    bmp: mdi('file-image', palette.image),
    ico: mdi('file-image', palette.image),
    avif: mdi('file-image', palette.image),
    gif: mdi('file-image', palette.image),
    svg: mdi('vector-square', palette.image),
    mp3: mdi('music-note', palette.audio),
    wav: mdi('music-note', palette.audio),
    ogg: mdi('music-note', palette.audio),
    flac: mdi('music-note', palette.audio),
    aac: mdi('music-note', palette.audio),
    m4a: mdi('music-note', palette.audio),
    opus: mdi('music-note', palette.audio),
    mp4: mdi('film', palette.video),
    webm: mdi('film', palette.video),
    mov: mdi('film', palette.video),
    mkv: mdi('film', palette.video),
    avi: mdi('film', palette.video),
    pdf: mdi('file-pdf', palette.document),
    zip: mdi('archive', palette.archive),
    tar: mdi('archive', palette.archive),
    gz: mdi('archive', palette.archive),
    txt: mdi('file-text', palette.text),
    md: mdi('language-markdown', palette.text),
    json: mdi('code-json', palette.text),
    csv: mdi('file-delimited', palette.text),
    html: mdi('language-html5', palette.text),
  };
  return map[e] ?? svgIcons.plugin;
}
