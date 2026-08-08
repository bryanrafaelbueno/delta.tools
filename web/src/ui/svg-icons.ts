// Colorful SVG icons (inline data URIs) used instead of emojis across the app.

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

function svg(body: string, fill: string): string {
  const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill}">${body}</svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(raw)))}`;
}

const imageBody =
  '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="2"/><path d="M21 15.5 16 11l-7 7-3-3"/>';
const audioBody =
  '<path d="M9 18V6l10-2v11.5"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>';
const videoBody =
  '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3z"/>';
const documentBody =
  '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/><path d="M9 12h6M9 16h6"/>';
const archiveBody =
  '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 10h8M8 14h5"/><path d="m8 8-1 1M8 12l-1 1M8 16-1 1"/>';
const textBody =
  '<path d="M4 5h16M4 10h16M4 15h10M4 19h7"/><path d="M14 15h6l-3 6z"/>';
const pluginBody =
  '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/>';
const downloadBody =
  '<path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M4 20h16"/>';

export const svgIcons = {
  image: svg(imageBody, palette.image),
  audio: svg(audioBody, palette.audio),
  video: svg(videoBody, palette.video),
  document: svg(documentBody, palette.document),
  archive: svg(archiveBody, palette.archive),
  text: svg(textBody, palette.text),
  plugin: svg(pluginBody, palette.plugin),
  download: svg(downloadBody, palette.download),
};

export function svgIconForExt(ext: string): string {
  const map: Record<string, keyof typeof svgIcons> = {
    png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', bmp: 'image',
    ico: 'image', avif: 'image', gif: 'image', svg: 'image',
    mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', aac: 'audio',
    m4a: 'audio', opus: 'audio',
    mp4: 'video', webm: 'video', mov: 'video', mkv: 'video', avi: 'video',
    pdf: 'document',
    zip: 'archive', tar: 'archive', gz: 'archive',
    txt: 'text', md: 'text', json: 'text', csv: 'text', html: 'text',
  };
  const key = map[ext.toLowerCase()] ?? 'plugin';
  return svgIcons[key];
}
