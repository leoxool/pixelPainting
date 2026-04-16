-- Add nickname column to room_members
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS nickname TEXT;

-- Update RLS policy to allow updating nickname
DROP POLICY IF EXISTS "Members can update own membership" ON room_members;
CREATE POLICY "Members can update own membership"
  ON room_members FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow students to update their own nickname
DROP POLICY IF EXISTS "Students can update own assets" ON assets;
CREATE POLICY "Students can update own assets"
  ON assets FOR UPDATE
  USING (auth.uid() = student_id);
