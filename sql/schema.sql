-- ============================================================
-- CardValidator — Supabase Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- Table: card_validations
-- Stores every validation request from the frontend
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS card_validations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_code       TEXT NOT NULL,
  image_url       TEXT,                        -- public URL of uploaded card image
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','valid','used','invalid')),
  validated_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address      TEXT,
  user_agent      TEXT
);

-- Index for fast status queries
CREATE INDEX idx_card_validations_status ON card_validations(status);
CREATE INDEX idx_card_validations_created ON card_validations(created_at DESC);

-- ─────────────────────────────────────────────
-- Table: card_codes
-- Master list of valid codes and their state
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS card_codes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        TEXT UNIQUE NOT NULL,
  is_used     BOOLEAN NOT NULL DEFAULT FALSE,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes       TEXT
);

-- ─────────────────────────────────────────────
-- Storage bucket: card-images
-- ─────────────────────────────────────────────
-- Run this in the Supabase dashboard > Storage or via API:
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('card-images', 'card-images', true);

-- ─────────────────────────────────────────────
-- RLS Policies
-- ─────────────────────────────────────────────

-- Allow anonymous inserts (frontend, no login)
ALTER TABLE card_validations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert_validations"
  ON card_validations FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anonymous reads on card_codes (for validation lookup)
ALTER TABLE card_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_codes"
  ON card_codes FOR SELECT
  TO anon
  USING (true);

-- Service role can do everything (used by admin APK)
CREATE POLICY "service_all_validations"
  ON card_validations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_all_codes"
  ON card_codes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────
-- Function: validate_card_code
-- Called by the frontend to atomically validate + mark used
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION validate_card_code(
  p_code        TEXT,
  p_image_url   TEXT DEFAULT NULL,
  p_ip          TEXT DEFAULT NULL,
  p_agent       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code_row    card_codes%ROWTYPE;
  v_result      JSONB;
  v_status      TEXT;
  v_val_id      UUID;
BEGIN
  -- Look up the code
  SELECT * INTO v_code_row
  FROM card_codes
  WHERE code = UPPER(TRIM(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    v_status := 'invalid';
  ELSIF v_code_row.is_used THEN
    v_status := 'used';
  ELSE
    v_status := 'valid';
    -- Mark as used
    UPDATE card_codes
    SET is_used = TRUE, used_at = NOW()
    WHERE id = v_code_row.id;
  END IF;

  -- Log the validation attempt
  INSERT INTO card_validations
    (card_code, image_url, status, validated_at, ip_address, user_agent)
  VALUES
    (UPPER(TRIM(p_code)), p_image_url, v_status, NOW(), p_ip, p_agent)
  RETURNING id INTO v_val_id;

  v_result := jsonb_build_object(
    'id',     v_val_id,
    'status', v_status,
    'code',   UPPER(TRIM(p_code))
  );

  RETURN v_result;
END;
$$;

-- ─────────────────────────────────────────────
-- Sample seed data (optional)
-- ─────────────────────────────────────────────
INSERT INTO card_codes (code, notes) VALUES
  ('CARD-ALPHA-001', 'Test card 1'),
  ('CARD-BETA-002',  'Test card 2'),
  ('CARD-GAMMA-003', 'Test card 3')
ON CONFLICT (code) DO NOTHING;
