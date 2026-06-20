-- Demo camera support — Plan §Demo (post-sync improvements).
-- When `demo_video_url` is set, the live monitor treats this camera as a
-- looped-video pair: a hidden publisher in the proctor's browser tab
-- captures frames from the asset and pushes them to the AI service so
-- the tile shows real detections overlaid on the demo footage.
--
-- The asset itself is hosted in the public `demo-assets` Supabase
-- bucket (see 20260515091500_create_demo_assets_bucket.sql); the
-- column stores its public URL so we can swap content without
-- touching schema.

ALTER TABLE public.cameras
  ADD COLUMN demo_video_url TEXT;

COMMENT ON COLUMN public.cameras.demo_video_url IS
  'Plan §Demo — when non-null this camera is a looped-video "demo pair"; the live monitor spawns an in-tab publisher that captures frames from this URL and pushes them to the AI service.';
