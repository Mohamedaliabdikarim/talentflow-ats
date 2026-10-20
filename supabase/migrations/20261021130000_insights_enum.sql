-- AI Candidate Insights — lifecycle enum values (migration 0006, ADR-035).
--
-- The insight_status enum was created in 0001 as ('pending','completed','failed'). The job-match
-- lifecycle needs four more states. New enum values are added in THIS migration, on their own, so
-- they are committed before migration 0007 references them in an index predicate (PostgreSQL forbids
-- using a newly added enum value in the same transaction that adds it).
--
-- 'completed' is kept (legacy, unused by the new code); 'ready' is the terminal success state so the
-- stored vocabulary matches the product requirement and docs/AI_INSIGHTS.md §4.
--
-- Rollback: enum values cannot be dropped in PostgreSQL. To undo, restore from a backup taken before
-- this migration. There is no destructive change here (values are additive), so forward-only is safe.

alter type public.insight_status add value if not exists 'analyzing';
alter type public.insight_status add value if not exists 'ready';
alter type public.insight_status add value if not exists 'revoked';
alter type public.insight_status add value if not exists 'superseded';
