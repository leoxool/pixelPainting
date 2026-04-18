-- ============================================
-- Add session expiration mechanism
-- ============================================

-- Add session expiration column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ;

-- Update set_session_token function to add 24-hour expiration
CREATE OR REPLACE FUNCTION set_session_token(p_user_id UUID, p_token TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET current_session_token = p_token,
      last_active_at = NOW(),
      session_expires_at = NOW() + INTERVAL '24 hours'
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update validate_session to check expiration
CREATE OR REPLACE FUNCTION validate_session(p_user_id UUID, p_token TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_stored_token TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT current_session_token, session_expires_at
  INTO v_stored_token, v_expires_at
  FROM profiles
  WHERE id = p_user_id;

  -- If token is expired, clear it and return false
  IF v_expires_at IS NOT NULL AND v_expires_at < NOW() THEN
    UPDATE profiles SET current_session_token = NULL WHERE id = p_user_id;
    RETURN FALSE;
  END IF;

  IF v_stored_token IS NULL OR v_stored_token = p_token THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update clear_session_token to also clear expiration
CREATE OR REPLACE FUNCTION clear_session_token(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET current_session_token = NULL,
      session_expires_at = NULL,
      last_active_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
