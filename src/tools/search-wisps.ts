import type Database from 'better-sqlite3';
import { z } from 'zod';

// --- Input Schema ---

export const SearchWispsInput = z.object({
  query: z
    .string()
    .optional()
    .describe('Text to match in wisp name or description'),
  cost: z.number().optional().describe('Filter by gold cost'),
  category: z
    .string()
    .optional()
    .describe('Filter by category, e.g. Combat, Shop, Champion, Item, GoldXP, Risky, Misc'),
  limit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(20)
    .describe('Max results to return, 1-50 (default: 20)'),
});

export type SearchWispsInputType = z.infer<typeof SearchWispsInput>;

// --- Result types ---

export interface WispSummary {
  name: string;
  cost: number | null;
  category: string | null;
  description: string;
  upgraded: string | null;
}

export interface SearchWispsResult {
  wisps: WispSummary[];
  total: number;
}

// --- Handler ---

export function searchWisps(db: Database.Database, input: SearchWispsInputType): SearchWispsResult {
  const where: string[] = [];
  const params: unknown[] = [];
  if (input.query) {
    where.push('(name LIKE ? OR description LIKE ?)');
    params.push(`%${input.query}%`, `%${input.query}%`);
  }
  if (input.cost !== undefined) {
    where.push('cost = ?');
    params.push(input.cost);
  }
  if (input.category) {
    where.push('category = ? COLLATE NOCASE');
    params.push(input.category);
  }
  params.push(input.limit ?? 20);

  const wisps = db.prepare(`
    SELECT name, cost, category, description, upgraded
    FROM wisps
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY cost, name
    LIMIT ?
  `).all(...params) as WispSummary[];

  return { wisps, total: wisps.length };
}
