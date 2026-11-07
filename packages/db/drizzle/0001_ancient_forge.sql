DROP INDEX `repositories_team_id_unique`;--> statement-breakpoint
CREATE INDEX `repositories_team_id_idx` ON `repositories` (`team_id`);