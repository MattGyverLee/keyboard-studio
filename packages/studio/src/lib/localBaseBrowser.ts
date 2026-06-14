// Dev-only BaseBrowserService backed by the localKeyboards Vite plugin
// (see ../../vite-plugins/localKeyboards.ts). Hits /local-kbd-api/list
// to enumerate every keyboard in the sibling keymanapp/keyboards clone.

import type {
  BaseBrowserService,
  BaseKeyboard,
  KeymanPlatformTarget,
} from "@keyboard-studio/contracts";

const LIST_ENDPOINT = "/local-kbd-api/list";
const LANGUAGES_ENDPOINT = "/local-kbd-api/languages";

let _cached: Promise<BaseKeyboard[]> | null = null;

async function fetchCatalog(): Promise<BaseKeyboard[]> {
  if (_cached !== null) return _cached;
  _cached = (async () => {
    const [listRes, langRes] = await Promise.all([
      fetch(LIST_ENDPOINT),
      fetch(LANGUAGES_ENDPOINT).catch(() => null),
    ]);
    if (!listRes.ok) {
      _cached = null;
      throw new Error(
        `${LIST_ENDPOINT} returned HTTP ${listRes.status} — is the local-keyboards Vite plugin loaded?`,
      );
    }
    const data = (await listRes.json()) as unknown;
    if (!Array.isArray(data)) {
      _cached = null;
      throw new Error(
        `${LIST_ENDPOINT} returned non-array payload: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }
    // Merge fresh language data from the dedicated endpoint.  This bypasses
    // the catalog cache in the Vite plugin so language-match ranking always
    // reflects the current .kps files regardless of catalog cache state.
    let langMap: Record<string, string[]> = {};
    if (langRes !== null && langRes.ok) {
      try { langMap = (await langRes.json()) as Record<string, string[]>; } catch { /* ignore */ }
    }
    return (data as BaseKeyboard[]).map((kb) => {
      const langs = langMap[kb.id];
      if (langs !== undefined && langs.length > 0 && (kb.languages === undefined || kb.languages.length === 0)) {
        return { ...kb, languages: langs };
      }
      return kb;
    });
  })();
  return _cached;
}

export const localBaseBrowser: BaseBrowserService = {
  async listAll(): Promise<BaseKeyboard[]> {
    return fetchCatalog();
  },
  async search(
    query: string,
    opts?: { script?: string; target?: KeymanPlatformTarget },
  ): Promise<BaseKeyboard[]> {
    const all = await fetchCatalog();
    const q = query.toLowerCase();
    return all.filter((k) => {
      const matchesQuery =
        q === "" ||
        k.id.toLowerCase().includes(q) ||
        k.displayName.toLowerCase().includes(q);
      const matchesScript = opts?.script === undefined || k.script === opts.script;
      const matchesTarget =
        opts?.target === undefined || k.targets.includes(opts.target);
      return matchesQuery && matchesScript && matchesTarget;
    });
  },
  async getById(id: string): Promise<BaseKeyboard | undefined> {
    const all = await fetchCatalog();
    return all.find((k) => k.id === id);
  },
};

/** [SCAFFOLD] Proxy base path that pairs with this dev backend; pass to
 *  fetchKeyboardSourceToVfs's `opts.proxyBase`. */
export const LOCAL_PROXY_BASE = "/local-kbd-proxy";
