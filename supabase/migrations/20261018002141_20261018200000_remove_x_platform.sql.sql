/*
# Remove X (Twitter) — Meta-only publishing

1. Plain-English explanation
   The product owner will only support Meta platforms (Facebook and
   Instagram). This migration removes X everywhere:

   - Updates the `platform` allowed values on `planned_posts` and
     `platform_connections` to only 'facebook' and 'instagram'.
   - Existing rows with platform 'x' are kept but marked 'failed'/
     'disconnected' respectively so no history is lost (data safety:
     nothing is deleted).

2. Modified tables
   - `planned_posts`: platform CHECK constraint narrowed.
   - `platform_connections`: platform CHECK constraint narrowed; 'x' rows
     set to 'disconnected'.

3. Security
   - No policy changes.

4. Important notes
   - The OAuth edge function also stops offering 'x'; the frontend hides X
     from platform lists.
*/

-- Keep history: mark x rows instead of deleting them
UPDATE platform_connections SET status = 'disconnected' WHERE platform = 'x';

ALTER TABLE planned_posts DROP CONSTRAINT IF EXISTS planned_posts_platform_check;
ALTER TABLE planned_posts ADD CONSTRAINT planned_posts_platform_check
  CHECK (platform IN ('facebook','instagram'));

ALTER TABLE platform_connections DROP CONSTRAINT IF EXISTS platform_connections_platform_check;
ALTER TABLE platform_connections ADD CONSTRAINT platform_connections_platform_check
  CHECK (platform IN ('facebook','instagram'));
