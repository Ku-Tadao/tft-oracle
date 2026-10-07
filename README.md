# tft-oracle

<!-- mcp-name: io.github.gregario/tft-oracle -->

Teamfight Tactics MCP server — accurate champion, trait, item, and augment data for LLMs.

<p align="center">
  <a href="https://www.npmjs.com/package/tft-oracle"><img src="https://img.shields.io/npm/v/tft-oracle.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/tft-oracle"><img src="https://img.shields.io/npm/dm/tft-oracle.svg" alt="npm downloads"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node.js 18+"></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-purple.svg" alt="MCP Compatible"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://github.com/sponsors/gregario"><img src="https://img.shields.io/badge/sponsor-♥-ea4aaa.svg" alt="Sponsor"></a>
  <a href="https://glama.ai/mcp/servers/gregario/tft-oracle"><img src="https://glama.ai/mcp/servers/gregario/tft-oracle/badges/score.svg" alt="tft-oracle MCP server"></a>
</p>

Stop LLMs from hallucinating TFT data. tft-oracle gives AI assistants accurate, up-to-date game knowledge sourced from [CommunityDragon](https://communitydragon.org).

## Features

- **Champions** — Full stats, traits, abilities, and costs for all champions in the current set
- **Traits** — Breakpoint thresholds, scaling values, and champion membership
- **Items** — Complete recipe tree, stat effects, and component relationships
- **Augments** — Descriptions and effects, plus tiers with an overlay source
- **Rolling Odds** — Shop probability tables by player level
- **Auto-updates** — Data refreshes from CommunityDragon on each server start

## Tools

| Tool | Description |
|------|-------------|
| `search_champions` | Search champions by name, cost, trait, or role |
| `get_champion` | Full champion profile with stats, traits, and ability |
| `search_traits` | Search and list traits |
| `get_trait` | Trait detail with breakpoints and champion list |
| `search_items` | Search items by name or component |
| `get_item_recipe` | Item recipe tree and reverse lookups |
| `search_augments` | Search augments by name, effect, or tier |
| `search_wisps` | Search Set 18 wisps by name, cost, or category (needs overlay) |
| `get_rolling_odds` | Champion shop odds by player level |

## Install

This fork isn't published to npm (`npx tft-oracle` installs the upstream package). Build it locally:

```bash
git clone https://github.com/Ku-Tadao/tft-oracle.git
cd tft-oracle
npm ci && npm run build
claude mcp add tft-oracle -s user -- node "$PWD/dist/server.js"
```

For Claude Desktop, point `command`/`args` at `node` and the same `dist/server.js` path.

## Data Source

Game data is sourced from [CommunityDragon](https://communitydragon.org), which extracts structured data from Riot Games' TFT client files. Data is cached at `~/.tft-oracle/` (download refreshed every 6 hours) and re-ingested on every server start, so new patches show up without manual steps. The current set is detected automatically: the highest-numbered set in CommunityDragon's `latest` (live) data.

No Riot Games API key is required.

### Missing values

Any value the data doesn't contain is shown as `[?]`, never guessed. In-game counters (e.g. "Rolls: [?]") have no static value by nature.

**Set 18 champion abilities:** with Set 18, TFT moved to Unreal Engine and CommunityDragon no longer extracts ability values (2 of 74 champions have them; Sets 16–17 had nearly all). Champion stats, traits, items and augments are unaffected. Ability numbers come back automatically if CommunityDragon restores them, or right away with an overlay source.

### Optional overlay source

Set `TFT_ORACLE_OVERLAY_URL` to a base URL with a `{set}` placeholder to layer extra data over CommunityDragon:

```bash
claude mcp add tft-oracle -s user -e TFT_ORACLE_OVERLAY_URL='https://example.com/tft/set{set}/en_us' -- node "$PWD/dist/server.js"
```

The server fetches three JSON files from that base on every start. Each one is optional, and any file that is missing or fails to load leaves CommunityDragon's data in place.

| File | Shape | Effect |
|------|-------|--------|
| `units` | `{ [apiName]: { apiKey, ability: { name, description } } }` | Replaces ability text (values already filled in) |
| `augments` | `{ tier1\|tier2\|tier3: { [key]: { key, name, description } } }` | Replaces the augment list and adds Silver/Gold/Prismatic tiers |
| `wisps` | `{ [apiName]: { apiKey, name, cost, description, tags, upgrades: [{ description }] } }` | Fills `search_wisps` |

Without the env var, `search_wisps` returns nothing and augments have no tier.

## Legal

tft-oracle isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, Teamfight Tactics, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

Game data provided by [CommunityDragon](https://communitydragon.org), created under Riot Games' "Legal Jibber Jabber" policy.

## License

MIT
