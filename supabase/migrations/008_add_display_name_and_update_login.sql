-- ============================================
-- Add display_name field
-- ============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Update existing records
UPDATE profiles SET display_name = username;

-- Update login function to return display_name
CREATE OR REPLACE FUNCTION login_with_username(p_username TEXT)
RETURNS JSONB AS $$
DECLARE
  v_profile RECORD;
  v_email TEXT;
BEGIN
  SELECT p.id, p.username, p.display_name, p.role, p.current_session_token, u.email
  INTO v_profile
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.username = p_username;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_profile.id,
    'email', v_profile.email,
    'username', v_profile.username,
    'display_name', COALESCE(v_profile.display_name, v_profile.username),
    'role', v_profile.role,
    'stored_token', v_profile.current_session_token
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
