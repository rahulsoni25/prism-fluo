-- Add presentations table for storing generated decks
CREATE TABLE IF NOT EXISTS presentations (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  brief_name TEXT,
  headline TEXT,
  gamma_url TEXT,
  status TEXT DEFAULT 'generated', -- 'generating', 'generated', 'failed'
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast lookups
CREATE INDEX idx_presentations_user_id ON presentations(user_id);
CREATE INDEX idx_presentations_analysis_id ON presentations(analysis_id);
CREATE INDEX idx_presentations_created_at ON presentations(created_at DESC);

-- Add constraint to ensure user can only access their own presentations
ALTER TABLE presentations
  ADD CONSTRAINT presentations_user_analysis_user_fk
  FOREIGN KEY (user_id, analysis_id) REFERENCES analyses(user_id, id);
