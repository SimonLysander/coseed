ALTER TABLE requirement_revisions ADD COLUMN scope_json TEXT CHECK (scope_json IS NULL OR json_valid(scope_json));
--> statement-breakpoint
ALTER TABLE requirement_revisions ADD COLUMN primary_concern TEXT CHECK (primary_concern IS NULL OR primary_concern IN ('functionality', 'usability', 'performance', 'reliability', 'security', 'compatibility', 'maintainability'));
