import { registerImageConverters } from './image';
import { registerMediaConverters } from './media';
import { registerPdfConverters } from './pdf';
import { registerArchiveConverters } from './archive';
import { registerTextConverters } from './text';
import { registerRepairConverters } from './repair';

export function registerBuiltinConverters(): void {
  registerImageConverters();
  registerMediaConverters();
  registerPdfConverters();
  registerArchiveConverters();
  registerTextConverters();
  registerRepairConverters();
}
