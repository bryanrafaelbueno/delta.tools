import type { PluginManifest } from '../types';
import { svgIcons } from '../ui/svg-icons';

export function validateManifest(m: unknown): PluginManifest {
  const obj = m as Partial<PluginManifest>;
  if (!obj || typeof obj !== 'object') throw new Error('Manifest must be a JSON object');
  if (!obj.id || !/^[a-z0-9][a-z0-9.-]{2,63}$/.test(obj.id)) {
    throw new Error('id must be a lowercase reverse-domain identifier, e.g. com.example.tool');
  }
  if (!obj.name || typeof obj.name !== 'string') throw new Error('name is required');
  if (!obj.version || typeof obj.version !== 'string') throw new Error('version is required (e.g. 1.0.0)');
  if (!obj.description || typeof obj.description !== 'string') throw new Error('description is required');
  if (!obj.author || typeof obj.author !== 'string') throw new Error('author is required');
  if (!Array.isArray(obj.inputs) || !Array.isArray(obj.outputs)) throw new Error('inputs and outputs must be arrays');
  if (obj.inputs.length === 0 || obj.outputs.length === 0) throw new Error('inputs and outputs must not be empty');
  for (const ext of [...obj.inputs, ...obj.outputs]) {
    if (!/^[a-z0-9]{1,8}$/.test(ext)) throw new Error(`Invalid extension: "${ext}"`);
  }
  if (!obj.entry || typeof obj.entry !== 'string') throw new Error('entry (plugin code) is required');
  return {
    id: obj.id,
    name: obj.name,
    version: obj.version,
    description: obj.description,
    author: obj.author,
    icon: obj.icon || svgIcons.plugin,
    iconColor: obj.iconColor || undefined,
    inputs: obj.inputs,
    outputs: obj.outputs,
    entry: obj.entry,
  };
}
