
-- =============================================
-- Instagram Publishing Agent - Database Schema
-- =============================================

-- 1. Instagram hesap bilgileri
CREATE TABLE ig_accounts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ig_user_id text NOT NULL UNIQUE,
  ig_username text,
  page_id text,
  access_token_enc text NOT NULL,
  token_expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE ig_accounts IS 'Instagram Business/Creator hesap bilgileri ve token yönetimi';

-- 2. İçerik kuyruğu - post, story, reel, carousel
CREATE TABLE ig_content_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES ig_accounts(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('IMAGE', 'VIDEO', 'REELS', 'STORIES', 'CAROUSEL')),
  caption text,
  hashtags text[],
  media_url text,
  thumbnail_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'scheduled', 'publishing', 'published', 'failed')),
  scheduled_at timestamptz,
  published_at timestamptz,
  ig_media_id text,
  ig_container_id text,
  error_message text,
  metadata jsonb DEFAULT '{}',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE ig_content_queue IS 'Instagram yayınlama kuyruğu - tüm içerik tipleri';

CREATE INDEX idx_ig_content_queue_status ON ig_content_queue(status);
CREATE INDEX idx_ig_content_queue_scheduled ON ig_content_queue(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_ig_content_queue_account ON ig_content_queue(account_id);

-- 3. Carousel öğeleri
CREATE TABLE ig_carousel_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id uuid NOT NULL REFERENCES ig_content_queue(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO')),
  media_url text NOT NULL,
  sort_order integer DEFAULT 0,
  ig_container_id text,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE ig_carousel_items IS 'Carousel postları için bireysel medya öğeleri (max 10)';

CREATE INDEX idx_ig_carousel_items_content ON ig_carousel_items(content_id);

-- 4. Yayınlama logları
CREATE TABLE ig_publish_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id uuid NOT NULL REFERENCES ig_content_queue(id) ON DELETE CASCADE,
  action text NOT NULL,
  status text NOT NULL,
  request_data jsonb,
  response_data jsonb,
  error_message text,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE ig_publish_log IS 'Instagram API çağrılarının detaylı logları';

CREATE INDEX idx_ig_publish_log_content ON ig_publish_log(content_id);

-- 5. Otomatik zamanlama ayarları
CREATE TABLE ig_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES ig_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  content_types text[] DEFAULT ARRAY['IMAGE', 'REELS'],
  cron_expression text NOT NULL,
  is_active boolean DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE ig_schedules IS 'Otomatik yayınlama zamanlamaları (cron tabanlı)';

-- 6. Telegram chat-account bağlantısı
CREATE TABLE ig_telegram_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_chat_id text NOT NULL UNIQUE,
  account_id uuid NOT NULL REFERENCES ig_accounts(id) ON DELETE CASCADE,
  state text DEFAULT 'idle',
  state_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE ig_telegram_links IS 'Telegram chat ID ile Instagram hesap eşleştirmesi ve conversation state';

CREATE INDEX idx_ig_telegram_links_chat ON ig_telegram_links(telegram_chat_id);

-- 7. RLS politikaları
ALTER TABLE ig_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ig_content_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE ig_carousel_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ig_publish_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ig_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE ig_telegram_links ENABLE ROW LEVEL SECURITY;

-- n8n service role ile erişim için policy (service_role key kullanıldığında RLS bypass edilir)
-- Ama güvenlik için yine de policy ekleyelim
CREATE POLICY "Service role full access on ig_accounts" ON ig_accounts
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on ig_content_queue" ON ig_content_queue
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on ig_carousel_items" ON ig_carousel_items
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on ig_publish_log" ON ig_publish_log
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on ig_schedules" ON ig_schedules
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on ig_telegram_links" ON ig_telegram_links
  FOR ALL USING (true) WITH CHECK (true);

-- 8. updated_at trigger fonksiyonu (varsa kullan, yoksa oluştur)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ig_accounts_updated_at
  BEFORE UPDATE ON ig_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ig_content_queue_updated_at
  BEFORE UPDATE ON ig_content_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ig_schedules_updated_at
  BEFORE UPDATE ON ig_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ig_telegram_links_updated_at
  BEFORE UPDATE ON ig_telegram_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
