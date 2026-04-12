# System Knowledge Base

Last updated: 2026-04-12T16:56:06.786Z
Total entries: 4
Modules: 3

## Modules

### core/index
- Fixed buildIndexes to treat affects field as inverse of depends_on in dependency graph (2026-04-12) — `c754c3b5-e197-420a-a28a-4e9b77a5bba1`
- Added rebuildAll helper that calls buildIndexes then generateIndexMd in one pass (2026-04-12) — `dfe480d4-e2cd-4473-8b35-e382da24b3d5`

### core/store
- Added top-level one-line comment summarizing module purpose (2026-04-12) — `77e4e10b-8804-4c88-ac74-788681f475d1`

### mcp/server
- Redesigned read_knowledge from substring search to target-based index lookup (2026-04-12) — `adccdb34-7589-4226-b24a-22b2e268d5cd`

## Assumptions (all)

- mcp/server: _graph/ indexes are always fresh via rebuildAll after every write_knowledge call
