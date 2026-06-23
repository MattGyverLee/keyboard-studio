// Service container. Config flag: VITE_USE_REAL_ENGINE (default: true).
// Set VITE_USE_REAL_ENGINE=false in .env.local to force mocks (test/CI only).
// Note: mockBaseBrowser / mockOutputService / mockScaffolder imports here are
// intentional — services.ts is the designated service boundary. Vite
// tree-shakes them in real builds. Do NOT add mocks imports elsewhere in
// packages/studio/src/.
import type {
  BaseBrowserService,
  CharacterDiscoveryService,
  OutputService,
  PatternLibraryService,
  ScaffolderService,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { mockBaseBrowser, mockOutputService, mockScaffolder } from "@keyboard-studio/contracts/mocks";
import { localBaseBrowser, LOCAL_PROXY_BASE } from "./localBaseBrowser.ts";
import { getPatternLibraryService as getBrowserPatternLibraryService } from "./browserPatternLibrary.ts";
import { mockPatternLibrary } from "@keyboard-studio/contracts/mocks";

export const USE_REAL = import.meta.env.VITE_USE_REAL_ENGINE !== "false";

// Re-export the proxy base for callers that need it (e.g. scaffolder).
export { LOCAL_PROXY_BASE };

// BaseBrowserService: backed by the build-time/dev-server catalog at
// /local-kbd-api/list. In dev the localKeyboards Vite plugin serves it from
// the sibling keymanapp/keyboards clone; in production the build-keyboards-index
// script materialises dist/local-kbd-api/list at deploy time. Both feed the
// same localBaseBrowser implementation, so this stays synchronous and never
// touches the GitHub API at runtime.
export function getBaseBrowserService(): BaseBrowserService {
  return USE_REAL ? localBaseBrowser : mockBaseBrowser;
}

// ScaffolderService: when USE_REAL is false returns the mock scaffolder so
// CI / test runs never touch WASM. When real, lazily imports from the engine
// (mirrors the loadEngine() lazy-import pattern in useKeyboardArtifact) and
// pins it to /local-kbd-proxy so per-keyboard source fetches go through the
// same Vercel/Vite rewrite as the catalog.
let scaffolderCache: ScaffolderService | null = null;
export async function getScaffolderService(): Promise<ScaffolderService> {
  if (!USE_REAL) return mockScaffolder;
  if (scaffolderCache !== null) return scaffolderCache;
  const { createScaffolderService } = await import(
    /* @vite-ignore */ "@keyboard-studio/engine"
  );
  scaffolderCache = createScaffolderService({ proxyBase: LOCAL_PROXY_BASE });
  return scaffolderCache;
}

// PatternLibraryService: in the browser the BrowserPatternLibraryService loads
// patterns via import.meta.glob (no node:fs). When USE_REAL is false returns
// the mock so CI/test never triggers the glob loader.
export function getPatternLibraryService(): PatternLibraryService {
  return USE_REAL ? getBrowserPatternLibraryService() : mockPatternLibrary;
}

// ---------------------------------------------------------------------------
// Mock JSON responses for the linguist synthesizeInventory path.
// Each entry is a valid JSON string that parseLinguistJson can parse.
// Keyed by BCP47 prefix (language subtag or language+script).
// Derived from packages/contracts/src/fixtures/linguistInventories.ts so shapes
// stay realistic and the cross-check pipeline runs deterministically.
// ---------------------------------------------------------------------------

const MOCK_LINGUIST_JSON: Record<string, string> = {
  // Hausa Latin — ha / ha-Latn / ha-*
  "ha": JSON.stringify({
    language: "ha",
    script: "Latin",
    alphabet_core: {
      lowercase: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "r", "s", "t", "u", "w", "y", "z", "ƴ", "ɓ", "ɗ"],
      uppercase: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "R", "S", "T", "U", "W", "Y", "Z", "Ƴ", "Ɓ", "Ɗ"],
    },
    mandatory_diacritics_and_ligatures: [],
    language_specific_punctuation: [],
    numerals: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
    digraphs_as_phoneme_units: ["sh", "ts", "ny", "ng"],
  }),
  // Hindi Devanagari — hi / hi-Deva
  "hi": JSON.stringify({
    language: "hi",
    script: "Devanagari",
    alphabet_core: {
      lowercase: ["क", "ख", "ग", "घ", "च", "छ", "ज", "झ", "ट", "ठ", "ड", "ढ", "त", "थ", "द", "ध", "न", "प", "फ", "ब", "भ", "म", "य", "र", "ल", "व", "श", "ष", "स", "ह"],
      uppercase: [],
    },
    mandatory_diacritics_and_ligatures: [],
    language_specific_punctuation: [],
    numerals: ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"],
    nukta_and_borrowed_sound_markers: ["क़", "ख़", "ग़"],
    independent_vowels: ["अ", "आ", "इ", "ई", "उ", "ऊ", "ए", "ऐ", "ओ", "औ"],
  }),
  // Hebrew RTL — he / he-Hebr
  "he": JSON.stringify({
    language: "he",
    script: "Hebrew",
    alphabet_core: {
      lowercase: ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ", "ק", "ר", "ש", "ת"],
      uppercase: [],
    },
    mandatory_diacritics_and_ligatures: [],
    language_specific_punctuation: [],
    numerals: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
    direction_control_chars: ["U+200F", "U+200E"],
  }),
  // Cree Canadian Syllabics — cr / cr-Cans
  "cr": JSON.stringify({
    language: "cr-Cans",
    script: "Canadian Syllabics",
    alphabet_core: {
      lowercase: ["ᐁ", "ᐃ", "ᐅ", "ᐊ", "ᐄ", "ᐆ", "ᐋ", "ᐯ", "ᐱ", "ᐳ", "ᐸ", "ᑌ", "ᑎ", "ᑐ", "ᑕ", "ᑫ", "ᑭ", "ᑯ", "ᑲ"],
      uppercase: [],
    },
    mandatory_diacritics_and_ligatures: [],
    language_specific_punctuation: [],
    numerals: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
    syllabic_final_markers: ["ᐧ"],
  }),
};

// Generic Latin fallback — used for unknown BCP47 tags that use a Latin script.
const MOCK_LINGUIST_JSON_LATIN_FALLBACK = JSON.stringify({
  language: "und-Latn",
  script: "Latin",
  alphabet_core: {
    lowercase: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"],
    uppercase: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"],
  },
  mandatory_diacritics_and_ligatures: [],
  language_specific_punctuation: [],
  numerals: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
});

/**
 * Select a mock JSON payload for a given BCP47 tag.
 * Matching priority: full tag prefix → language subtag → Latin fallback.
 */
function selectMockJson(bcp47: string): string {
  // Exact match first (e.g. "ha-Latn")
  const exact = MOCK_LINGUIST_JSON[bcp47];
  if (exact !== undefined) return exact;
  // Language subtag prefix match (e.g. "ha" from "ha-Latn-NG")
  const lang = bcp47.split("-")[0] ?? "";
  const byLang = MOCK_LINGUIST_JSON[lang];
  if (byLang !== undefined) return byLang;
  // Fall back to generic Latin inventory
  return MOCK_LINGUIST_JSON_LATIN_FALLBACK;
}

// Deterministic stub CldrLoader — returns a small known exemplar set per locale
// so cldrCrossCheck runs offline without any network calls.
// The hausa loader returns an exemplar string for "ha" so flags are exercised;
// all others return null (graceful fallback in cldrCrossCheck).
function createStubCldrLoader(): (locale: string) => Promise<string | null> {
  const STUB_EXEMPLARS: Record<string, string> = {
    // Hausa Latin exemplar — a minimal Unicode set expression
    ha: "[a b c d e f g h i j k l m n o r s t u w y z {sh} {ts} {ny} {ng}]",
  };
  return async (locale: string): Promise<string | null> => {
    return STUB_EXEMPLARS[locale] ?? null;
  };
}

// CharacterDiscoveryService: when USE_REAL is false returns a minimal stub so
// CI / test runs never touch the CLDR CDN or the LLM completer. When real,
// lazily imports from the engine and injects:
//   1. A MOCK LLM completer that returns canned JSON keyed by script/BCP47.
//   2. A deterministic stub CldrLoader so cldrCrossCheck runs offline.
// The real synthesizeInventory → parseLinguistJson → cldrCrossCheck pipeline
// runs end-to-end on the mock data.
//
// TODO(linguist-llm): swap mock completer for a live @keyboard-studio/llm client
// (deferred — see plan). The stub CldrLoader should also be replaced with
// createFetchCldrLoader() once LLM is live, since CLDR cross-check is cheap.
let charDiscoveryCache: CharacterDiscoveryService | null = null;
export async function getCharacterDiscoveryService(): Promise<CharacterDiscoveryService> {
  if (!USE_REAL) {
    const stub: CharacterDiscoveryService = {
      harvestFromText: async () => [],
      pickerCandidates: async () => [],
      synthesizeInventory: async () => { throw new Error("LLM completer not configured in test mode"); },
    };
    return stub;
  }
  if (charDiscoveryCache !== null) return charDiscoveryCache;
  const { createCharacterDiscoveryService } = await import(
    /* @vite-ignore */ "@keyboard-studio/engine"
  );

  // Deterministic stub CldrLoader — no network calls during authoring.
  const stubLoader = createStubCldrLoader();

  // Mock LLM completer: parse the BCP47 out of the prompt and return a
  // canned JSON string that parseLinguistJson can parse. The real completer
  // would call the LLM API here.
  // TODO(linguist-llm): swap mock completer for a live @keyboard-studio/llm client
  // (deferred — see plan).
  const mockCompleter = async (prompt: string): Promise<string> => {
    // Extract the BCP47 tag from the prompt template placeholder "Target Language: ... (tag)"
    const match = /\(([^)]+)\)\s*\n/.exec(prompt);
    const bcp47 = match?.[1] ?? "";
    return selectMockJson(bcp47);
  };

  charDiscoveryCache = createCharacterDiscoveryService(stubLoader, mockCompleter);
  return charDiscoveryCache;
}

// OutputService (zip path only): when USE_REAL is false returns the mock zip
// serializer. When real, lazily imports toZip from the engine.
// The GitHub OAuth publishPR path is separate (createGitHubOutputService).
let toZipCache: ((vfs: VirtualFS) => Promise<Uint8Array>) | null = null;
export async function getToZip(): Promise<(vfs: VirtualFS) => Promise<Uint8Array>> {
  if (!USE_REAL) return mockOutputService.toZip.bind(mockOutputService);
  if (toZipCache !== null) return toZipCache;
  const { toZip } = await import(/* @vite-ignore */ "@keyboard-studio/engine");
  toZipCache = toZip as (vfs: VirtualFS) => Promise<Uint8Array>;
  return toZipCache;
}

// GitHubOutputService (verifyToken / publishPR — the OAuth fork+PR path,
// spec §12 "Option A"): when USE_REAL is false returns the mock (which already
// implements verifyToken/publishPR against fixture data). When real, lazily
// imports createGitHubOutputService from the engine, which wires the calls to
// the live GitHub API via fetch. Cached after first construction.
//
// Only the verifyToken/publishPR slice of OutputService is exposed here — the
// zip path goes through getToZip above.
type GitHubOutputService = Pick<OutputService, "verifyToken" | "publishPR">;
let gitHubOutputServiceCache: GitHubOutputService | null = null;
export async function getGitHubOutputService(): Promise<GitHubOutputService> {
  if (!USE_REAL) return mockOutputService;
  if (gitHubOutputServiceCache !== null) return gitHubOutputServiceCache;
  const { createGitHubOutputService } = await import(
    /* @vite-ignore */ "@keyboard-studio/engine"
  );
  gitHubOutputServiceCache = createGitHubOutputService();
  return gitHubOutputServiceCache;
}
