export const VIEW_REFRESH_MS = 3 * 60 * 60 * 1000;

export interface CachedRows {
  at: number;
  rows: unknown[];
}

export interface RowStore {
  get(key: string): CachedRows | null;
  set(key: string, entry: CachedRows): void;
}

const ALL = "*";

export interface PatchRowCache<T extends { patch: string }> {
  load(
    scope: string,
    patches: string[] | undefined,
    fetchRows: (patches?: string[]) => Promise<T[]>,
  ): Promise<T[]>;
  clear(): void;
}

export function createPatchRowCache<T extends { patch: string }>({
  view,
  ttlMs = VIEW_REFRESH_MS,
  limit = 400,
  store,
}: {
  view: string;
  ttlMs?: number;
  limit?: number;
  store?: RowStore;
}): PatchRowCache<T> {
  const memory = new Map<string, { at: number; rows: Promise<T[]> }>();

  const keyOf = (scope: string, patch: string) => `${view}|${scope}|${patch}`;

  const remember = (key: string, at: number, rows: Promise<T[]>) => {
    memory.delete(key);
    memory.set(key, { at, rows });
    if (memory.size > limit) memory.delete(memory.keys().next().value as string);
  };

  const lookup = (key: string): Promise<T[]> | null => {
    const now = Date.now();
    const hit = memory.get(key);
    if (hit && now - hit.at < ttlMs) return hit.rows;
    const stored = store?.get(key);
    if (stored && now - stored.at < ttlMs) {
      const rows = Promise.resolve(stored.rows as T[]);
      remember(key, stored.at, rows);
      return rows;
    }
    return null;
  };

  const fetchInto = (
    patches: string[],
    scope: string,
    fetchRows: (patches?: string[]) => Promise<T[]>,
  ): Promise<T[]>[] => {
    const at = Date.now();
    const request = fetchRows(patches[0] === ALL ? undefined : patches);
    return patches.map((patch) => {
      const key = keyOf(scope, patch);
      const rows = request.then((all) =>
        patch === ALL ? all : all.filter((r) => r.patch === patch),
      );
      remember(key, at, rows);
      rows.then(
        (r) => store?.set(key, { at, rows: r }),
        () => {
          if (memory.get(key)?.rows === rows) memory.delete(key);
        },
      );
      return rows;
    });
  };

  return {
    async load(scope, patches, fetchRows) {
      if (patches == null) {
        return lookup(keyOf(scope, ALL)) ?? fetchInto([ALL], scope, fetchRows)[0];
      }

      const wanted = [...new Set(patches)];
      const everything = lookup(keyOf(scope, ALL));
      if (everything) {
        const included = new Set(wanted);
        return (await everything).filter((r) => included.has(r.patch));
      }

      const parts: Promise<T[]>[] = [];
      const missing: string[] = [];
      for (const patch of wanted) {
        const cached = lookup(keyOf(scope, patch));
        if (cached) parts.push(cached);
        else missing.push(patch);
      }
      if (missing.length > 0) parts.push(...fetchInto(missing, scope, fetchRows));
      return (await Promise.all(parts)).flat();
    },
    clear() {
      memory.clear();
    },
  };
}
