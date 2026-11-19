CREATE TABLE `credit_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`entry_type` text NOT NULL,
	`amount_micro_usd` integer NOT NULL,
	`balance_after_micro_usd` integer NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `policy_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`span_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`matched_rule` text NOT NULL,
	`decision` text NOT NULL,
	`original_input_json` text,
	`final_input_json` text,
	`operator_note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`span_id`) REFERENCES `spans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_path` text NOT NULL,
	`title` text NOT NULL,
	`model_id` text NOT NULL,
	`effort_level` text NOT NULL,
	`budget_cap_micro_usd` integer,
	`total_cost_micro_usd` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE TABLE `spans` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`parent_span_id` text,
	`span_type` text NOT NULL,
	`name` text NOT NULL,
	`file_path` text,
	`status` text DEFAULT 'running' NOT NULL,
	`input_json` text,
	`output_json` text,
	`diff_text` text,
	`error_message` text,
	`cost_micro_usd` integer DEFAULT 0 NOT NULL,
	`latency_ms` integer,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `spans_session_idx` ON `spans` (`session_id`);--> statement-breakpoint
CREATE INDEX `spans_parent_idx` ON `spans` (`parent_span_id`);--> statement-breakpoint
CREATE TABLE `turns` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`turn_index` integer NOT NULL,
	`user_prompt` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`thinking_tokens` integer DEFAULT 0 NOT NULL,
	`cost_micro_usd` integer DEFAULT 0 NOT NULL,
	`cache_savings_micro_usd` integer DEFAULT 0 NOT NULL,
	`context_used_tokens` integer DEFAULT 0 NOT NULL,
	`context_limit_tokens` integer DEFAULT 0 NOT NULL,
	`context_breakdown_json` text,
	`compacted` integer DEFAULT false NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `turns_session_idx` ON `turns` (`session_id`);