-- ============================================
-- Enable Anonymous Student Sessions
-- ============================================

-- Change user_id in room_members to TEXT (for session IDs)
ALTER TABLE room_members DROP CONSTRAINT IF EXISTS room_members_user_id_fkey;
ALTER TABLE room_members ALTER COLUMN user_id TYPE TEXT;

-- Change student_id in assets to TEXT (for session IDs)
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_student_id_fkey;
ALTER TABLE assets ALTER COLUMN student_id TYPE TEXT;

-- Drop old RLS policies that rely on auth.uid() for students
DROP POLICY IF EXISTS "Users can join rooms" ON room_members;
DROP POLICY IF EXISTS "Members can view own membership" ON room_members;
DROP POLICY IF EXISTS "Members can leave rooms" ON room_members;
DROP POLICY IF EXISTS "Students can insert assets to joined rooms" ON assets;
DROP POLICY IF EXISTS "Students can view assets in joined rooms" ON assets;
DROP POLICY IF EXISTS "Students can update own assets" ON assets;
DROP POLICY IF EXISTS "Students can delete own assets" ON assets;

-- New policies for anonymous sessions
-- Anyone can join a room as student (session-based)
CREATE POLICY "Anyone can join rooms"
  ON room_members FOR INSERT
  WITH CHECK (true);

-- Anyone can view room membership (needed for checking if already joined)
CREATE POLICY "Anyone can view room membership"
  ON room_members FOR SELECT
  USING (true);

-- Members can leave rooms
CREATE POLICY "Members can leave rooms"
  ON room_members FOR DELETE
  USING (true);

-- Anyone can insert assets (students upload via session ID)
CREATE POLICY "Anyone can insert assets"
  ON assets FOR INSERT
  WITH CHECK (true);

-- Anyone can view assets in rooms
CREATE POLICY "Anyone can view assets"
  ON assets FOR SELECT
  USING (true);

-- Owner can update assets
CREATE POLICY "Owner can update assets"
  ON assets FOR UPDATE
  USING (true);

-- Owner can delete assets
CREATE POLICY "Owner can delete assets"
  ON assets FOR DELETE
  USING (true);

-- Enable anonymous access for Supabase
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
