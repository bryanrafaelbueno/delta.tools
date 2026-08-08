export interface ConverterDef {
  id: string;
  name: string;
  description: string;
  category: Category;
  from: string;
  to: string;
  source: 'builtin' | 'plugin';
  icon: string;
  pluginId?: string;
}

export type Category = 'image' | 'audio' | 'video' | 'document' | 'archive' | 'text' | 'other';

export interface ConvertInput {
  name: string;
  ext: string;
  type: string;
  data: ArrayBuffer;
}

export interface ConvertResult {
  name: string;
  type: string;
  data: ArrayBuffer;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon: string;
  inputs: string[];
  outputs: string[];
  entry: string;
}

export interface MarketplacePlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon: string;
  inputs: string[];
  outputs: string[];
  downloads: number;
  created_at: string;
  entry: string;
}

export interface User {
  id: string;
  username: string;
  role: string;
  created_at: string;
}

export const CATEGORIES: Record<Category, { label: string; icon: string }> = {
  image: { label: 'Image', icon: '🖼️' },
  audio: { label: 'Audio', icon: '🎵' },
  video: { label: 'Video', icon: '🎬' },
  document: { label: 'Document', icon: '📄' },
  archive: { label: 'Archive', icon: '🗜️' },
  text: { label: 'Text', icon: '📝' },
  other: { label: 'Plugins', icon: '🧩' },
};

export function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(0, dot) : name;
}
