import type {
  TftRawData,
  RawSetData,
  RawChampion,
  RawTrait,
  RawItem,
  RawVariable,
  Champion,
  Trait,
  Item,
  Augment,
} from './types.js';

// --- Set detection ---

/**
 * Detect the current (highest-numbered) set from the raw data.
 * Uses the `sets` key, picking the highest numeric key.
 */
export function detectCurrentSet(data: TftRawData): string {
  const numericKeys = Object.keys(data.sets).filter(k => /^\d+$/.test(k));
  if (numericKeys.length === 0) {
    throw new Error('No numbered sets found in TFT data');
  }
  return numericKeys.reduce((max, k) => (Number(k) > Number(max) ? k : max));
}

/**
 * Get the set data for a given set number.
 */
export function getSetData(data: TftRawData, setNumber: string): RawSetData {
  const setData = data.sets[setNumber];
  if (!setData) {
    throw new Error(`Set ${setNumber} not found in TFT data`);
  }
  return setData;
}

/**
 * Get the augment apiNames CommunityDragon lists for a set.
 * Newer sets use non-prefixed ids (DA_*, TFT_Augment_*), so the prefix filter alone finds none.
 */
export function getSetAugmentNames(data: TftRawData, setNumber: string): string[] | undefined {
  if (!Array.isArray(data.setData)) return undefined;
  const meta = data.setData.find(s => String(s.number) === setNumber && s.augments?.length);
  return meta?.augments;
}

// --- Description resolution ---

/**
 * Strip HTML/TFT markup tags from a description string.
 * Converts <br> to newline, removes all other tags.
 */
export function stripMarkup(desc: string): string {
  if (!desc) return '';
  return desc
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
}

/**
 * FNV-1a hash of the lowercased name, in CommunityDragon's "{xxxxxxxx}" form.
 * CommunityDragon emits this for value names it can't unhash.
 */
export function hashName(name: string): string {
  let h = 0x811c9dc5;
  for (const ch of name.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `{${h.toString(16).padStart(8, '0')}}`;
}

/** Marker for a value the data source doesn't provide. */
export const MISSING_VALUE = '[?]';

/**
 * Resolve @Variable@ template placeholders in a description.
 *
 * Variables can have:
 * - Simple values: @Damage@ → "100"
 * - Star-level scaling arrays: @Damage@ → "100/150/200" (1-star/2-star/3-star)
 * - Math expressions: @Damage*100@ → multiply value by 100
 * - Hashed names: @Damage@ also matches a "{fnv1a}" key
 * - Anything unresolvable becomes [?] so consumers don't invent a number
 *
 * Stat icons (%i:scaleAD%) become readable tags ([AD]); other %i:…% icons are dropped.
 */
export function resolveDescription(
  desc: string,
  variables: RawVariable[]
): string {
  if (!desc) return '';

  // Build lookup map (case-insensitive)
  const varMap = new Map<string, number | number[]>();
  for (const v of variables) {
    if (v.name != null && v.value != null) {
      varMap.set(v.name.toLowerCase(), v.value);
    }
  }

  // Replace @VarName@ and @VarName*multiplier@ patterns
  let resolved = desc.replace(/@(\w+)(?:\*(\d+(?:\.\d+)?))?(%)?@/g, (_match, name: string, multiplier?: string, pct?: string) => {
    const value = varMap.get(name.toLowerCase()) ?? varMap.get(hashName(name));
    if (value === undefined) return MISSING_VALUE;

    const mult = multiplier ? parseFloat(multiplier) : 1;

    if (Array.isArray(value)) {
      // Star-level scaling: show as "val1/val2/val3"
      // Skip first element if it's 0 (often a placeholder for 0-star)
      const levels = value.length > 3 && value[0] === 0 ? value.slice(1) : value;
      return levels
        .map(v => formatNumber(v * mult))
        .join('/') + (pct ?? '');
    }

    return formatNumber(value * mult) + (pct ?? '');
  });

  // In-game counters (@TFTUnitProperty.…@, @TFTTrait.…@) have no static value
  resolved = resolved.replace(/@[^@\s]+@/g, MISSING_VALUE);

  // Stat icons tell which stat a number is; keep them as [AD], [Armor], ...
  resolved = resolved.replace(/%i:scale(\w+)%/g, '[$1]').replace(/%i:\w+%/g, '');

  // Strip HTML/TFT markup
  resolved = stripMarkup(resolved);

  return resolved;
}

/**
 * Format a number: drop trailing zeros, round to 2 decimals.
 */
function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  // Round to 2 decimal places and strip trailing zeros
  return parseFloat(n.toFixed(2)).toString();
}

// --- Champion parsing ---

/**
 * Parse champions from set data.
 * Filters out non-playable units (those without traits).
 */
export function parseChampions(setData: RawSetData): Champion[] {
  return setData.champions
    .filter(c => c.traits.length > 0) // Only real champions
    .map(parseChampion);
}

function parseChampion(raw: RawChampion): Champion {
  return {
    name: raw.name,
    apiName: raw.apiName,
    cost: raw.cost,
    role: raw.role ?? null,
    hp: raw.stats.hp ?? null,
    ad: raw.stats.damage ?? null,
    armor: raw.stats.armor ?? null,
    mr: raw.stats.magicResist ?? null,
    attackSpeed: raw.stats.attackSpeed ?? null,
    mana: raw.stats.mana,
    initialMana: raw.stats.initialMana,
    range: raw.stats.range,
    critChance: raw.stats.critChance ?? null,
    critMultiplier: raw.stats.critMultiplier ?? null,
    abilityName: raw.ability.name,
    abilityDesc: resolveDescription(raw.ability.desc, raw.ability.variables),
    abilityVariables: JSON.stringify(
      raw.ability.variables.filter(v => v.name != null && v.value != null)
    ),
    traits: raw.traits,
  };
}

// --- Trait parsing ---

/**
 * Parse traits from set data with their breakpoints.
 */
export function parseTraits(setData: RawSetData): Trait[] {
  return setData.traits.map(parseTrait);
}

function effectVars(e: RawTrait['effects'][number] | undefined): RawVariable[] {
  if (!e) return [];
  return [
    { name: 'MinUnits', value: e.minUnits },
    { name: 'MaxUnits', value: e.maxUnits },
    ...Object.entries(e.variables).map(([name, value]) => ({ name, value })),
  ];
}

function parseTrait(raw: RawTrait): Trait {
  // Each <row> describes one breakpoint; resolve it with that breakpoint's values.
  // Text outside rows uses the first breakpoint.
  let row = 0;
  const desc = raw.desc.replace(/<row>([\s\S]*?)<\/row>/g, (_m, body: string) =>
    resolveDescription(body, effectVars(raw.effects[row++])) + '<br>'
  );

  return {
    name: raw.name,
    apiName: raw.apiName,
    description: resolveDescription(desc, effectVars(raw.effects[0])),
    breakpoints: raw.effects.map(e => ({
      minUnits: e.minUnits,
      maxUnits: e.maxUnits,
      style: e.style,
      variables: e.variables,
    })),
  };
}

// --- Item & augment parsing ---

/**
 * Determine the current set prefix (e.g., "TFT16") for filtering augments.
 */
function getCurrentSetPrefix(setNumber: string): string {
  return `TFT${setNumber}`;
}

/**
 * Check if a raw item is an augment.
 * Augments are identified by having "Augment" in their apiName.
 */
export function isAugment(item: RawItem): boolean {
  return item.apiName.includes('Augment');
}

/**
 * Check if a raw item is a component (base crafting item).
 */
export function isComponent(item: RawItem): boolean {
  return item.tags.includes('component');
}

/**
 * Parse items from the raw items array.
 * Separates regular items from augments.
 * Filters to base items (TFT_Item_ prefix) and current-set items only.
 *
 * @param items - Raw items array from CommunityDragon
 * @param currentSetNumber - The current set number (e.g., "16")
 * @param setAugmentNames - Augment apiNames live in the set (from setData); overrides prefix-based augment detection
 */
export function parseItems(
  items: RawItem[],
  currentSetNumber: string,
  setAugmentNames?: string[]
): { items: Item[]; augments: Augment[] } {
  const setPrefix = getCurrentSetPrefix(currentSetNumber);
  const setAugments = setAugmentNames && new Set(setAugmentNames);
  const parsedItems: Item[] = [];
  const parsedAugments: Augment[] = [];

  for (const raw of items) {
    // When the set lists its augments, that list is the source of truth for augments
    if (setAugments && (setAugments.has(raw.apiName) || isAugment(raw))) {
      if (setAugments.has(raw.apiName) && raw.name) parsedAugments.push(parseAugment(raw));
      continue;
    }

    // Skip items from other sets (keep base TFT_Item_ items and current set items)
    const isBaseItem = raw.apiName.startsWith('TFT_Item_');
    const isCurrentSet = raw.apiName.startsWith(setPrefix);

    if (!isBaseItem && !isCurrentSet) continue;

    // Skip items with no name (e.g., TFT_Item_EmptyBag, TFT_Item_Blank)
    if (!raw.name) continue;

    if (isAugment(raw)) {
      parsedAugments.push(parseAugment(raw));
    } else {
      parsedItems.push(parseItem(raw));
    }
  }

  return { items: parsedItems, augments: parsedAugments };
}

function effectVariables(raw: RawItem): RawVariable[] {
  return raw.effects
    ? Object.entries(raw.effects).map(([name, value]) => ({
        name,
        value: value as number | number[] | null,
      }))
    : [];
}

function parseItem(raw: RawItem): Item {
  return {
    name: raw.name,
    apiName: raw.apiName,
    description: resolveDescription(raw.desc, effectVariables(raw)),
    effects: JSON.stringify(raw.effects),
    composition: JSON.stringify(raw.composition),
    tags: raw.tags.join(','),
    isComponent: isComponent(raw),
    unique: raw.unique,
  };
}

function parseAugment(raw: RawItem): Augment {
  return {
    name: raw.name,
    apiName: raw.apiName,
    description: resolveDescription(raw.desc, effectVariables(raw)),
    effects: JSON.stringify(raw.effects),
  };
}
