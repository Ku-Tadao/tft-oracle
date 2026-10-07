import type Database from 'better-sqlite3';
import { z } from 'zod';

// --- Input Schema ---

export const SearchAugmentsInput = z.object({
  query: z
    .string()
    .optional()
    .describe('Free-text search across augment name and description (uses FTS5)'),
  tier: z
    .enum(['silver', 'gold', 'prismatic'])
    .optional()
    .describe('Filter by tier (only available when tier data is loaded)'),
  limit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(20)
    .describe('Max results to return, 1-50 (default: 20)'),
});

export type SearchAugmentsInputType = z.infer<typeof SearchAugmentsInput>;

// --- Result types ---

export interface AugmentSummary {
  name: string;
  description: string;
  tier: string | null;
}

const TIER_NAMES = ['silver', 'gold', 'prismatic'];

export interface SearchAugmentsResult {
  augments: AugmentSummary[];
  total: number;
}

// --- Handler ---

export function searchAugments(
  db: Database.Database,
  input: SearchAugmentsInputType,
): SearchAugmentsResult {
  const limit = input.limit ?? 20;

  const where: string[] = [];
  const params: unknown[] = [];
  if (input.query) {
    where.push('augments_fts MATCH ?');
    params.push(input.query);
  }
  if (input.tier) {
    where.push('a.tier = ?');
    params.push(TIER_NAMES.indexOf(input.tier) + 1);
  }
  params.push(limit);

  const sql = `
    SELECT a.name, a.description, a.tier
    FROM augments a
    ${input.query ? 'JOIN augments_fts fts ON a.rowid = fts.rowid' : ''}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${input.query ? 'fts.rank' : 'a.tier, a.name'}
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(...params) as Array<{
    name: string;
    description: string | null;
    tier: number | null;
  }>;

  const augments: AugmentSummary[] = rows.map((row) => ({
    name: row.name,
    description: row.description ?? '',
    tier: row.tier ? TIER_NAMES[row.tier - 1] : null,
  }));

  return { augments, total: augments.length };
}
