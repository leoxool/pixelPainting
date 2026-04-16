-- Add room name column
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS name TEXT;

-- Change join_code to 4 characters
ALTER TABLE rooms ALTER COLUMN join_code TYPE VARCHAR(4);

-- Update the generate_join_code function for 4 characters
CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS VARCHAR(4) AS $$
DECLARE
  chars TEXT := '0123456789';
  result VARCHAR(4) := '';
  i INTEGER;
BEGIN
  FOR i IN 1..4 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
