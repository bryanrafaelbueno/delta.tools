import type { Category, ConverterDef, ConvertInput, ConvertResult } from '../types';

export type ConvertFn = (input: ConvertInput, onProgress?: (p: number) => void) => Promise<ConvertResult>;

export interface RegisteredConverter {
  def: ConverterDef;
  run: ConvertFn;
}

class Registry {
  private map = new Map<string, RegisteredConverter>();

  register(def: ConverterDef, run: ConvertFn): void {
    this.map.set(def.id, { def, run });
  }

  get(id: string): RegisteredConverter | undefined {
    return this.map.get(id);
  }

  all(): RegisteredConverter[] {
    return [...this.map.values()];
  }

  find(from: string, to: string, category?: Category): RegisteredConverter[] {
    return this.all().filter(
      (c) => c.def.from === from && c.def.to === to && (!category || c.def.category === category),
    );
  }
}

export const registry = new Registry();
