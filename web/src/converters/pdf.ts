import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { registry } from './registry';
import { svgIcons } from '../ui/svg-icons';
import { toResult } from './helpers';

const PDFJS = (pdfjsLib as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions;
PDFJS.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

function baseNoExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export function registerPdfConverters(): void {
  // PDF -> Images
  for (const fmt of ['png', 'jpg']) {
    registry.register(
      {
        id: `pdf-img-${fmt}`,
        name: `PDF to ${fmt.toUpperCase()}`,
        description: `Render every PDF page as a ${fmt.toUpperCase()} image`,
        category: 'document',
        from: 'pdf',
        to: fmt,
        source: 'builtin',
        icon: svgIcons.document,
      },
      async (input) => {
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(input.data) }).promise;
        const images: Blob[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          const blob = await new Promise<Blob>((res, rej) =>
            canvas.toBlob(
              (b) => (b ? res(b) : rej(new Error('render failed'))),
              fmt === 'png' ? 'image/png' : 'image/jpeg',
              0.92,
            ),
          );
          images.push(blob);
        }
        if (images.length === 1) {
          return toResult(images[0], `${baseNoExt(input.name)}.${fmt}`);
        }
        const combined = new Blob(images, { type: images[0].type });
        return toResult(combined, `${baseNoExt(input.name)}-pages.${fmt}`);
      },
    );
  }

  // Images -> PDF (single)
  registry.register(
    {
      id: 'img-pdf',
      name: 'Image to PDF',
      description: 'Combine images into a single PDF',
      category: 'document',
      from: 'png',
      to: 'pdf',
      source: 'builtin',
      icon: svgIcons.document,
    },
    async (input) => {
      const bitmap = await createImageBitmap(new Blob([input.data], { type: input.type }));
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([bitmap.width, bitmap.height]);
      const png = await pdf.embedPng(new Uint8Array(input.data));
      page.drawImage(png, { x: 0, y: 0, width: bitmap.width, height: bitmap.height });
      const bytes = await pdf.save();
      return { name: `${baseNoExt(input.name)}.pdf`, type: 'application/pdf', data: bytes.buffer as ArrayBuffer };
    },
  );

  // PDF merge
  registry.register(
    {
      id: 'pdf-merge',
      name: 'Merge PDFs',
      description: 'Combine multiple PDF files into one',
      category: 'document',
      from: 'pdf',
      to: 'pdf-merge',
      source: 'builtin',
      icon: svgIcons.document,
    },
    async () => {
      throw new Error('Multi-file operation — use the merge tool');
    },
  );

  // PDF compress
  registry.register(
    {
      id: 'pdf-compress',
      name: 'Compress PDF',
      description: 'Reduce PDF file size',
      category: 'document',
      from: 'pdf',
      to: 'pdf-compress',
      source: 'builtin',
      icon: svgIcons.document,
    },
    async (input) => {
      const doc = await PDFDocument.load(input.data);
      const bytes = await doc.save({ useObjectStreams: false });
      return { name: `${baseNoExt(input.name)}-compressed.pdf`, type: 'application/pdf', data: bytes.buffer as ArrayBuffer };
    },
  );
}
