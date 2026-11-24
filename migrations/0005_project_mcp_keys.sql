CREATE TABLE project_mcp_keys (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64),
  hint TEXT NOT NULL CHECK(length(hint) = 6),
  created_at INTEGER NOT NULL CHECK(created_at >= 0)
) STRICT;
--> statement-breakpoint
CREATE INDEX project_mcp_keys_project ON project_mcp_keys(project_id, created_at);
