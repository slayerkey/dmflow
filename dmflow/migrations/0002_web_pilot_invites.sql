-- Operator-managed invitation allowlist. Do not commit actual tester emails.
CREATE TABLE IF NOT EXISTS pilot_invites(email TEXT PRIMARY KEY COLLATE NOCASE, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), workspace_id TEXT REFERENCES workspaces(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS pilot_invites_workspace_idx ON pilot_invites(workspace_id) WHERE workspace_id IS NOT NULL;
