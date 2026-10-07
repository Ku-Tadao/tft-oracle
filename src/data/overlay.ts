/**
 * Optional overlay source: per-set JSON files (units, augments, wisps) that fill gaps
 * CommunityDragon leaves, e.g. resolved ability text, augment tiers and the set mechanic.
 *
 * Enabled by TFT_ORACLE_OVERLAY_URL, a base URL with a {set} placeholder:
 *   https://example.com/tft/set{set}/en_us   → fetches .../units, .../augments, .../wisps
 *
 * Every file is optional; a missing or failing file just leaves CommunityDragon's data in place.
 * ponytail: not cached on disk, add one if offline starts matter.
 */

import { resolveDescription } from './parser.js';
import type { Champion, Augment, Wisp } from './types.js';

export interface OverlayUnit {
  apiKey: string;
  ability?: { name?: string; description?: string };
}

export interface OverlayAugment {
  key: string;
  name: string;
  description: string;
}

export interface OverlayWisp {
  apiKey: string;
  name: string;
  cost: number;
  description: string;
  tags?: string[];
  upgrades?: Array<{ description?: string }>;
}

export interface Overlay {
  units?: OverlayUnit[];
  /** Augments grouped by tier key (tier1 = Silver, tier2 = Gold, tier3 = Prismatic). */
  augments?: Record<string, OverlayAugment[]>;
  wisps?: OverlayWisp[];
}

const list = <T>(x: unknown): T[] =>
  (Array.isArray(x) ? x : Object.values(x as Record<string, T>)) as T[];

export async function fetchOverlay(
  setNumber: string,
  fetchFn: typeof fetch = fetch,
  baseUrl = process.env.TFT_ORACLE_OVERLAY_URL,
): Promise<Overlay | null> {
  if (!baseUrl) return null;
  const base = baseUrl.replace('{set}', setNumber).replace(/\/$/, '');

  const get = async (file: string): Promise<unknown> => {
    try {
      const res = await fetchFn(`${base}/${file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`Overlay ${file} unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  };

  const [units, augments, wisps] = await Promise.all([get('units'), get('augments'), get('wisps')]);
  return {
    units: units ? list<OverlayUnit>(units) : undefined,
    augments: augments
      ? Object.fromEntries(Object.entries(augments as object).map(([tier, v]) => [tier, list<OverlayAugment>(v)]))
      : undefined,
    wisps: wisps ? list<OverlayWisp>(wisps) : undefined,
  };
}

const TIERS: Record<string, number> = { tier1: 1, tier2: 2, tier3: 3 };

/**
 * Merge overlay data into parsed CommunityDragon data.
 * Champions: overlay ability text wins (it ships with values filled in).
 * Augments: the overlay list replaces CommunityDragon's (it's the live pool, with tiers).
 */
export function applyOverlay(
  overlay: Overlay,
  champions: Champion[],
  augments: Augment[],
): { augments: Augment[]; wisps: Wisp[] } {
  const units = new Map(overlay.units?.map(u => [u.apiKey, u]));
  for (const champ of champions) {
    const ability = units.get(champ.apiName)?.ability;
    if (ability?.description) champ.abilityDesc = resolveDescription(ability.description, []);
    if (ability?.name) champ.abilityName = ability.name;
  }

  if (overlay.augments) {
    const cdragon = new Map(augments.map(a => [a.apiName, a]));
    augments = Object.entries(overlay.augments).flatMap(([tier, list]) =>
      list.filter(a => a.name).map(a => ({
        name: a.name,
        apiName: a.key,
        description: resolveDescription(a.description, []),
        effects: cdragon.get(a.key)?.effects ?? '{}',
        tier: TIERS[tier] ?? null,
      })),
    );
  }

  const wisps = (overlay.wisps ?? []).filter(w => w.name).map(w => ({
    name: w.name,
    apiName: w.apiKey,
    cost: w.cost,
    category: w.tags?.map(t => /\.Category\.(\w+)$/.exec(t)?.[1]).find(Boolean) ?? null,
    description: resolveDescription(w.description, []),
    upgraded: w.upgrades?.[0]?.description ? resolveDescription(w.upgrades[0].description, []) : null,
  }));

  return { augments, wisps };
}
