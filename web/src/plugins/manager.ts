import type { PluginManifest, ConvertResult } from '../types';
import { Sandbox } from './sandbox';
import { registry } from '../converters/registry';
import { pluginStore } from './store';

export function iconFor(ext: string): string {
  const map: Record<string, string> = {
    png: '🖼️',
    jpg: '🖼️',
    jpeg: '🖼️',
    webp: '🌐',
    gif: '🎞️',
    svg: '✒️',
    ico: '🖱️',
    bmp: '🪟',
    avif: '⚡',
    pdf: '📄',
    txt: '📝',
    md: '📝',
    html: '🌍',
    json: '🧾',
    csv: '📊',
    mp3: '🎧',
    wav: '🔊',
    ogg: '🎵',
    flac: '💿',
    mp4: '🎬',
    webm: '🌐',
    mov: '🎥',
  };
  return map[ext] ?? '🧩';
}

interface InstalledConverter {
  manifest: PluginManifest;
  sandbox: Sandbox;
  input: string;
  output: string;
}

export class PluginManager {
  private converters = new Map<string, InstalledConverter>();

  async loadAll(): Promise<void> {
    const list = await pluginStore.list();
    for (const manifest of list) {
      this.activate(manifest);
    }
  }

  activate(manifest: PluginManifest): void {
    try {
      const sandbox = new Sandbox(manifest);
      for (const input of manifest.inputs) {
        for (const output of manifest.outputs) {
          const id = `plugin-${manifest.id}-${input}-${output}`;
          this.converters.set(id, { manifest, sandbox, input, output });
          registry.register(
            {
              id,
              name: `${manifest.name}: ${input.toUpperCase()} to ${output.toUpperCase()}`,
              description: `${manifest.description} (community plugin by ${manifest.author})`,
              category: 'other' as never,
              from: input,
              to: output,
              source: 'plugin',
              pluginId: manifest.id,
              icon: manifest.icon || iconFor(output),
            },
            async (inp) => {
              const result = await sandbox.convert(inp);
              return result;
            },
          );
        }
      }
    } catch (err) {
      console.error('Failed to activate plugin', manifest.id, err);
    }
  }

  deactivate(id: string): void {
    for (const [convId, conv] of this.converters) {
      if (conv.manifest.id === id) {
        this.converters.delete(convId);
        registry.remove(convId);
      }
    }
  }

  sandboxFor(converterId: string): Sandbox | undefined {
    return this.converters.get(converterId)?.sandbox;
  }
}

export const pluginManager = new PluginManager();

export async function convertWithPlugin(manifest: PluginManifest, input: Parameters<Sandbox['convert']>[0]): Promise<ConvertResult> {
  const sandbox = new Sandbox(manifest);
  await sandbox.init();
  try {
    return await sandbox.convert(input);
  } finally {
    sandbox.destroy();
  }
}
