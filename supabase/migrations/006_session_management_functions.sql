-- ============================================
-- Session management functions
-- ============================================

-- Function to validate and update session token
-- Returns true if session is valid, false if token is stale
CREATE OR REPLACE FUNCTION validate_session(p_user_id UUID, p_token TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_stored_token TEXT;
BEGIN
  SELECT current_session_token INTO v_stored_token
  FROM profiles
  WHERE id = p_user_id;

  -- If no token stored or token matches, session is valid
  IF v_stored_token IS NULL OR v_stored_token = p_token THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set new session token (called on login)
CREATE OR REPLACE FUNCTION set_session_token(p_user_id UUID, p_token TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET current_session_token = p_token,
      last_active_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clear session token (called on logout)
CREATE OR REPLACE FUNCTION clear_session_token(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET current_session_token = NULL,
      last_active_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
