import type { PluginManifest } from '../types';
import { validateManifest } from './manifest';

const DB_NAME = 'delta-plugins';
const STORE = 'plugins';
const KEY = 'installed';

interface StoredPlugins {
  list: PluginManifest[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readPlugins(db: IDBDatabase): Promise<PluginManifest[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const get = tx.objectStore(STORE).get(KEY);
    get.onsuccess = () => {
      const data = get.result as StoredPlugins | undefined;
      resolve(data?.list ?? []);
    };
    get.onerror = () => reject(get.error);
  });
}

async function writePlugins(db: IDBDatabase, list: PluginManifest[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ list } satisfies StoredPlugins, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

export const pluginStore = {
  async list(): Promise<PluginManifest[]> {
    return withDb(readPlugins);
  },

  async install(manifest: unknown): Promise<PluginManifest> {
    const m = validateManifest(manifest);
    const db = await openDb();
    const list = await readPlugins(db);
    if (list.some((p) => p.id === m.id)) {
      db.close();
      throw new Error(`Plugin "${m.id}" is already installed`);
    }
    list.push(m);
    await writePlugins(db, list);
    db.close();
    return m;
  },

  async update(manifest: unknown): Promise<PluginManifest> {
    const m = validateManifest(manifest);
    const db = await openDb();
    const list = await readPlugins(db);
    const idx = list.findIndex((p) => p.id === m.id);
    if (idx === -1) {
      db.close();
      throw new Error(`Plugin "${m.id}" is not installed`);
    }
    list[idx] = m;
    await writePlugins(db, list);
    db.close();
    return m;
  },

  async uninstall(id: string): Promise<void> {
    const db = await openDb();
    const list = await readPlugins(db);
    await writePlugins(
      db,
      list.filter((p) => p.id !== id),
    );
    db.close();
  },

  async isInstalled(id: string): Promise<boolean> {
    const db = await openDb();
    const list = await readPlugins(db);
    db.close();
    return list.some((p) => p.id === id);
  },

  async get(id: string): Promise<PluginManifest | undefined> {
    const db = await openDb();
    const list = await readPlugins(db);
    db.close();
    return list.find((p) => p.id === id);
  },
};
