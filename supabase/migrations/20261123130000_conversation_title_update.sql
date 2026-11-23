-- Allow the workspace owner to rename their own conversations (chat title).
DROP POLICY IF EXISTS "update own conversations" ON conversations;
CREATE POLICY "update own conversations" ON conversations FOR UPDATE
  TO authenticated USING (auth.uid() = workspace_id) WITH CHECK (auth.uid() = workspace_id);
