-- BL-211 (Sprint 9) — Storage bucket for fine-tuned YOLO weights.
-- Private bucket; only authenticated users (in practice the AI service
-- service-role client + admins) read/write. Sprint 11's fine-tune
-- workflow uploads best.pt here and registers the path in ai_models.

INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-model-weights', 'ai-model-weights', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS ai_model_weights_admin_all ON storage.objects;
CREATE POLICY ai_model_weights_admin_all
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'ai-model-weights')
  WITH CHECK (bucket_id = 'ai-model-weights');
