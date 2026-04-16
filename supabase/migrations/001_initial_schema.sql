-- ============================================
-- Unit 1: Data & Auth Foundation (Supabase)
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE room_status AS ENUM (
  'waiting',    -- No active session
  'active',     -- Live session in progress
  'paused',     -- Session paused
  'completed'   -- Session finished
);

-- ============================================
-- TABLES
-- ============================================

-- Rooms table: Teacher creates a room with a join code
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  join_code VARCHAR(6) NOT NULL UNIQUE,
  status room_status NOT NULL DEFAULT 'waiting',
  config JSONB NOT NULL DEFAULT '{"gridWidth": 150, "gridHeight": 100, "sourceType": "webcam"}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Room members: Tracks which users have joined which rooms
CREATE TABLE room_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

-- Assets table: Student submissions (10-step texture atlas)
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  texture_url TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_rooms_teacher_id ON rooms(teacher_id);
CREATE INDEX idx_rooms_join_code ON rooms(join_code);
CREATE INDEX idx_room_members_room_id ON room_members(room_id);
CREATE INDEX idx_room_members_user_id ON room_members(user_id);
CREATE INDEX idx_assets_room_id ON assets(room_id);
CREATE INDEX idx_assets_student_id ON assets(student_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user role in a room
CREATE OR REPLACE FUNCTION get_user_room_role(p_room_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM room_members
  WHERE room_id = p_room_id AND user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper function to check if user is room teacher
CREATE OR REPLACE FUNCTION is_room_teacher(p_room_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM rooms
    WHERE id = p_room_id AND teacher_id = auth.uid()
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================
-- ROOMS POLICIES
-- ============================================

-- Teachers can create rooms
CREATE POLICY "Teachers can create rooms"
  ON rooms FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

-- Teachers can update their own rooms
CREATE POLICY "Teachers can update own rooms"
  ON rooms FOR UPDATE
  USING (auth.uid() = teacher_id);

-- Anyone authenticated can view rooms (for join code lookup)
CREATE POLICY "Authenticated users can view rooms"
  ON rooms FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Teachers can delete their own rooms
CREATE POLICY "Teachers can delete own rooms"
  ON rooms FOR DELETE
  USING (auth.uid() = teacher_id);

-- ============================================
-- ROOM_MEMBERS POLICIES
-- ============================================

-- Anyone can join a room as student (by join code)
CREATE POLICY "Users can join rooms"
  ON room_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Members can view their room membership
CREATE POLICY "Members can view own membership"
  ON room_members FOR SELECT
  USING (auth.uid() = user_id);

-- Members can leave rooms
CREATE POLICY "Members can leave rooms"
  ON room_members FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- ASSETS POLICIES
-- ============================================

-- Students can INSERT assets to rooms they joined
CREATE POLICY "Students can insert assets to joined rooms"
  ON assets FOR INSERT
  WITH CHECK (
    auth.uid() = student_id
    AND EXISTS (
      SELECT 1 FROM room_members
      WHERE room_id = assets.room_id
      AND user_id = auth.uid()
      AND role = 'student'
    )
  );

-- Teachers have FULL access to assets in their rooms
CREATE POLICY "Teachers have full access to room assets"
  ON assets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM rooms
      WHERE id = assets.room_id
      AND teacher_id = auth.uid()
    )
  );

-- Students can only view assets in rooms they joined
CREATE POLICY "Students can view assets in joined rooms"
  ON assets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_id = assets.room_id
      AND user_id = auth.uid()
    )
  );

-- Students can update their own assets
CREATE POLICY "Students can update own assets"
  ON assets FOR UPDATE
  USING (auth.uid() = student_id);

-- Students can delete their own assets
CREATE POLICY "Students can delete own assets"
  ON assets FOR DELETE
  USING (auth.uid() = student_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to generate a random 6-character join code
CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS VARCHAR(6) AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result VARCHAR(6) := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate join code on room insert
CREATE OR REPLACE FUNCTION set_room_join_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.join_code IS NULL OR NEW.join_code = '' THEN
    -- Keep trying until we get a unique code (max 100 attempts)
    FOR i IN 1..100 LOOP
      NEW.join_code := generate_join_code();
      IF NOT EXISTS (SELECT 1 FROM rooms WHERE join_code = NEW.join_code AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)) THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_room_join_code
  BEFORE INSERT ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION set_room_join_code();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- STORAGE BUCKETS
-- ============================================

-- Create storage bucket for room broadcasts (teacher snapshots)
INSERT INTO storage.buckets (id, name, public)
VALUES ('broadcasts', 'broadcasts', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for student texture assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for broadcasts
CREATE POLICY "Anyone can view broadcasts"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'broadcasts');

CREATE POLICY "Teachers can upload broadcasts to their rooms"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'broadcasts'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Teachers can update broadcasts in their rooms"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'broadcasts'
    AND auth.uid() IS NOT NULL
  );

-- Storage policies for assets
CREATE POLICY "Anyone can view assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'assets');

CREATE POLICY "Authenticated users can upload assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'assets'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can update own assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'assets'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can delete own assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'assets'
    AND auth.uid() IS NOT NULL
  );

-- ============================================
-- REALTIME
-- ============================================

-- Enable realtime for rooms and assets
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE assets;
