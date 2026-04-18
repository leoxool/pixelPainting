-- ============================================
-- Helper functions for username-based login
-- ============================================

-- Function to get user email by user ID
CREATE OR REPLACE FUNCTION get_user_email(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = p_user_id;
  RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to login with username and password
-- This is a wrapper that validates session and returns email for auth
CREATE OR REPLACE FUNCTION login_with_username(p_username TEXT, p_password TEXT)
RETURNS JSONB AS $$
DECLARE
  v_profile RECORD;
  v_email TEXT;
  v_new_token TEXT;
BEGIN
  -- Find profile by username
  SELECT p.id, p.role, p.current_session_token, u.email
  INTO v_profile
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.username = p_username;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_email := v_profile.email;

  -- Return needed info for client to complete login
  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_profile.id,
    'email', v_email,
    'role', v_profile.role,
    'stored_token', v_profile.current_session_token
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
