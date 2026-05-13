-- PRD-021 seed: Sprint 13–18 + ~70 backlog items
-- Source: docs/dataset-plan/dataset-development-plan.md v2.1 (Final)
-- Bağımlılık: 20260322153227_create_sprint_backlog_system.sql

-- ─────────────────────────────────────────────────────────────────────────
-- 1) SPRINTS — Sprint 13–18 (placeholder tarihler; admin /sprints UI'sında değiştirilebilir)
-- ─────────────────────────────────────────────────────────────────────────

insert into public.sprints (id, name, goal, start_date, end_date, status)
values
  ('a0000013-0000-0000-0000-000000000013', 'Sprint 13 — Live Pipeline Reliability',
   'Mobile camera pair drop kök nedenleri P0 düzeltmeleri (YOLO eager init, safe except, backpressure, visibility pause, auto-reconnect)',
   '2026-05-26', '2026-06-08', 'planning'),
  ('a0000014-0000-0000-0000-000000000014', 'Sprint 14 — Dataset Pipeline Foundation',
   'PRD-017 boru hattının gerçek implementasyonu + Faz 0-1/2/4 uyum altyapısı (anonymized bucket, training samples tablosu, audit taxonomy, RBAC)',
   '2026-06-09', '2026-06-22', 'planning'),
  ('a0000015-0000-0000-0000-000000000015', 'Sprint 15 — Phone & Earbuds & Smartwatch',
   'Domain adapte v1.0 — COCO + Open Images V7 + Roboflow + iç-controlled capture → YOLOv8n custom v1.0 deploy',
   '2026-06-23', '2026-07-06', 'planning'),
  ('a0000016-0000-0000-0000-000000000016', 'Sprint 16 — Paper Notes & Kalemlik & Hesap Makinesi',
   'Off-the-shelf veri yok — tamamen kontrollü iç-veri toplama + YOLOv8n v2.0',
   '2026-07-07', '2026-07-20', 'planning'),
  ('a0000017-0000-0000-0000-000000000017', 'Sprint 17 — Pose & Davranış & Gaze Refinement',
   'MediaPipe Pose + body_lean / standing / hand_under_desk + gaze_at_lap + synchronized_behavior',
   '2026-07-21', '2026-08-03', 'planning'),
  ('a0000018-0000-0000-0000-000000000018', 'Sprint 18 — Multi-Camera Fusion + Face Covering',
   'Cross-cam Re-ID + LiveMonitor demo flag kaldırma + face_covering (MaskedFace-Net)',
   '2026-08-04', '2026-08-17', 'planning')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) BACKLOG ITEMS — Sprint 13: Live Pipeline Reliability
-- ─────────────────────────────────────────────────────────────────────────

insert into public.backlog_items (sprint_id, title, description, prd_id, prd_section, dev_role, status, priority, estimated_hours, sort_order)
values
  ('a0000013-0000-0000-0000-000000000013',
   'YOLO eager init at FastAPI startup',
   'publish_handler.py:149-176 lazy-load yerine startup event''inde _get_yolo() çağrısı. İlk frame inference 5-15s → < 100ms.',
   'PRD-021', '§3 Sprint 13', 'ai_backend', 'backlog', 'critical', 3, 1),

  ('a0000013-0000-0000-0000-000000000013',
   'Publish loop safe except Exception',
   'publish_handler.py:388-486 — sadece WebSocketDisconnect değil generic Exception yakala. Per-frame error log; loop kapanmasın, frame skip edilsin.',
   'PRD-021', '§3 Sprint 13', 'ai_backend', 'backlog', 'critical', 4, 2),

  ('a0000013-0000-0000-0000-000000000013',
   'write_incident decouple via asyncio.Queue',
   'Receive loop bekletme. Queue + background worker; backpressure publish path''ten ayrı.',
   'PRD-021', '§3 Sprint 13', 'ai_backend', 'backlog', 'high', 10, 3),

  ('a0000013-0000-0000-0000-000000000013',
   'WS close code/reason structured logging',
   'publish + detections endpoint''leri. CloudWatch''a stack trace ve close_code/reason ile birlikte.',
   'PRD-021', '§3 Sprint 13', 'ai_backend', 'backlog', 'high', 4, 4),

  ('a0000013-0000-0000-0000-000000000013',
   'CloudWatch metric filters',
   'publish_idle_timeout, publish_exception, yolo_init_duration_ms metric filter''ları.',
   'PRD-021', '§3 Sprint 13', 'ai_backend', 'backlog', 'medium', 3, 5),

  ('a0000013-0000-0000-0000-000000000013',
   'Frontend bufferedAmount backpressure',
   'CamPairCapture.tsx:235-254 — if (ws.bufferedAmount > 250_000) return; skip frame.',
   'PRD-021', '§3 Sprint 13', 'portal_frontend', 'backlog', 'critical', 4, 6),

  ('a0000013-0000-0000-0000-000000000013',
   'Visibility pause/resume',
   'document.visibilityState === ''hidden'' → setStreaming(false). setInterval guard. iOS Safari için freeze/resume fallback.',
   'PRD-021', '§3 Sprint 13', 'portal_frontend', 'backlog', 'critical', 4, 7),

  ('a0000013-0000-0000-0000-000000000013',
   'Auto-reconnect with exponential backoff',
   'ws.onclose → 3 attempt: 1s/2s/4s. Telemetri her denemede.',
   'PRD-021', '§3 Sprint 13', 'portal_frontend', 'backlog', 'high', 6, 8),

  ('a0000013-0000-0000-0000-000000000013',
   'CamPairCapture debug overlay',
   'framesSent, bufferedAmount, lastCloseCode (dev-only). Production''da hidden.',
   'PRD-021', '§3 Sprint 13', 'portal_frontend', 'backlog', 'medium', 3, 9),

  ('a0000013-0000-0000-0000-000000000013',
   'Stretch — Detection worker pool',
   'asyncio.Queue + N=2 workers. P2 madde; zaman kalırsa, yoksa Sprint 18-10''a öteleme.',
   'PRD-021', '§3 Sprint 13', 'ai_backend', 'backlog', 'low', 12, 10),

  ('a0000013-0000-0000-0000-000000000013',
   'E2E reliability test',
   '30 dakika sustained mobile stream + screen-off + 4G/5G/WiFi switching. Android Chrome + iOS Safari.',
   'PRD-021', '§3 Sprint 13', 'project_coordinator', 'backlog', 'high', 8, 11),

  ('a0000013-0000-0000-0000-000000000013',
   'Postmortem Runbook',
   'Camera Pair Drop kök neden + fix listesi + monitoring runbook. ops referansı.',
   'PRD-021', '§3 Sprint 13', 'project_coordinator', 'backlog', 'medium', 4, 12);

-- ─────────────────────────────────────────────────────────────────────────
-- 3) BACKLOG ITEMS — Sprint 14: Dataset Pipeline Foundation
-- ─────────────────────────────────────────────────────────────────────────

insert into public.backlog_items (sprint_id, title, description, prd_id, prd_section, dev_role, status, priority, estimated_hours, sort_order)
values
  ('a0000014-0000-0000-0000-000000000014',
   'datasets tablosu migration + RLS',
   'PRD-017 §10 datasets table. FK datasets.ai_model_id → ai_models.id.',
   'PRD-021', '§3 Sprint 14', 'portal_backend', 'backlog', 'high', 4, 1),

  ('a0000014-0000-0000-0000-000000000014',
   'scripts/import_dataset.py',
   'Roboflow CLI + FiftyOne wrapper. Open Images V7 + COCO subset fetch.',
   'PRD-021', '§3 Sprint 14', 'ai_backend', 'backlog', 'high', 8, 2),

  ('a0000014-0000-0000-0000-000000000014',
   'scripts/convert_dataset.py',
   'COCO/VOC/OID CSV → YOLO format dönüşüm.',
   'PRD-021', '§3 Sprint 14', 'ai_backend', 'backlog', 'high', 8, 3),

  ('a0000014-0000-0000-0000-000000000014',
   'scripts/validate_dataset.py',
   'quality_report.json üretir — PRD-017 §6.3 eşikleri (resolution, bbox, blur, duplicate).',
   'PRD-021', '§3 Sprint 14', 'ai_backend', 'backlog', 'high', 8, 4),

  ('a0000014-0000-0000-0000-000000000014',
   'scripts/merge_datasets.py',
   'Class mapping (PRD-017 §8.1) + stratified split (PRD-017 §9).',
   'PRD-021', '§3 Sprint 14', 'ai_backend', 'backlog', 'high', 8, 5),

  ('a0000014-0000-0000-0000-000000000014',
   'scripts/anonymize_frame.py',
   'Gaussian blur yüzler. PRD-017 §18.3 KVKK.',
   'PRD-021', '§3 Sprint 14', 'ai_backend', 'backlog', 'medium', 4, 6),

  ('a0000014-0000-0000-0000-000000000014',
   'data/ klasör hierarchy + .gitignore + Supabase Storage bucket',
   'PRD-017 §5.1 standart klasör.',
   'PRD-021', '§3 Sprint 14', 'ai_backend', 'backlog', 'medium', 2, 7),

  ('a0000014-0000-0000-0000-000000000014',
   'config.yaml cleanup (HIZLI KAZANC)',
   'keyboard (76) ve laptop (63) classes_of_interest''ten çıkar. paper_detected mapping düzelt. Mevcut FP''leri anında düşürür.',
   'PRD-021', '§3 Sprint 14', 'ai_backend', 'backlog', 'critical', 2, 8),

  ('a0000014-0000-0000-0000-000000000014',
   '/api/ai/datasets CRUD endpoint''leri',
   'Admin-only RBAC. is_admin() guard. PRD-017 §15.',
   'PRD-021', '§3 Sprint 14', 'portal_backend', 'backlog', 'high', 8, 9),

  ('a0000014-0000-0000-0000-000000000014',
   '/admin/datasets UI',
   'Liste + kalite raporu görüntü + merge sihirbazı.',
   'PRD-021', '§3 Sprint 14', 'portal_frontend', 'backlog', 'high', 12, 10),

  ('a0000014-0000-0000-0000-000000000014',
   'E2E test — 100-frame dummy dataset',
   'import → validate → merge → export başarılı.',
   'PRD-021', '§3 Sprint 14', 'project_coordinator', 'backlog', 'medium', 6, 11),

  ('a0000014-0000-0000-0000-000000000014',
   'anonymized-training-frames bucket migration + RLS',
   'Private, 50MB limit, admin-only. PRD-021 Tasarım Kararı §2.',
   'PRD-021', '§3 Sprint 14', 'portal_backend', 'backlog', 'high', 3, 12),

  ('a0000014-0000-0000-0000-000000000014',
   'internal_training_samples tablo migration',
   'original_incident_id FK + class_id + bbox_yolo + annotation_status. PRD-021 Tasarım Kararı §1.',
   'PRD-021', '§3 Sprint 14', 'portal_backend', 'backlog', 'high', 4, 13),

  ('a0000014-0000-0000-0000-000000000014',
   'Audit event_type taxonomy genişleme',
   'dataset.{import,merge,validate,deploy,annotation_complete}. portal/lib/audit/dataset.ts modülü.',
   'PRD-021', '§3 Sprint 14', 'portal_backend', 'backlog', 'medium', 4, 14),

  ('a0000014-0000-0000-0000-000000000014',
   'routes.ts + ADMIN_ONLY_ROUTES + Sidebar Datasets entry',
   'Exam Module group altına yeni link.',
   'PRD-021', '§3 Sprint 14', 'portal_frontend', 'backlog', 'medium', 3, 15),

  ('a0000014-0000-0000-0000-000000000014',
   'RBAC sözleşmesi düzeltme',
   'Plan boyunca "chief proctor" → supervisor. Dataset endpoint''leri is_admin() guard.',
   'PRD-021', '§3 Sprint 14', 'fullstack', 'backlog', 'low', 1, 16);

-- ─────────────────────────────────────────────────────────────────────────
-- 4) BACKLOG ITEMS — Sprint 15: Phone & Earbuds & Smartwatch
-- ─────────────────────────────────────────────────────────────────────────

insert into public.backlog_items (sprint_id, title, description, prd_id, prd_section, dev_role, status, priority, estimated_hours, sort_order)
values
  ('a0000015-0000-0000-0000-000000000015',
   'COCO subset fetch',
   'cell phone 2000 + book 1000 görsel via FiftyOne.',
   'PRD-021', '§3 Sprint 15', 'ai_backend', 'backlog', 'high', 3, 1),

  ('a0000015-0000-0000-0000-000000000015',
   'Open Images V7 fetch',
   'Mobile phone 5000, Headphones 3000, Watch 3000.',
   'PRD-021', '§3 Sprint 15', 'ai_backend', 'backlog', 'high', 6, 2),

  ('a0000015-0000-0000-0000-000000000015',
   'Roboflow scout + indir',
   '3 earbuds + 2 smartwatch dataset. PRD-017 §4.2 filtreli.',
   'PRD-021', '§3 Sprint 15', 'ai_backend', 'backlog', 'high', 8, 3),

  ('a0000015-0000-0000-0000-000000000015',
   'Open Images Headphones in-ear filter',
   'Over-ear''ı çıkar; sadece in-ear/earbud görselleri tut.',
   'PRD-021', '§3 Sprint 15', 'ai_backend', 'backlog', 'medium', 6, 4),

  ('a0000015-0000-0000-0000-000000000015',
   'İç-controlled capture S2+S3+S4',
   'Phone (12 clip) + earbuds (6) + smartwatch (3) → 250-400 frame. docs/dataset-plan §5.2.',
   'PRD-021', '§3 Sprint 15', 'project_coordinator', 'backlog', 'high', 12, 5),

  ('a0000015-0000-0000-0000-000000000015',
   'CVAT annotation server kur',
   'Self-hosted Docker. Ekibe brief.',
   'PRD-021', '§3 Sprint 15', 'ai_backend', 'backlog', 'medium', 4, 6),

  ('a0000015-0000-0000-0000-000000000015',
   'Annotation — ~700 frame, 4 sınıf',
   'phone, earbuds_wireless/wired, smart_watch, book.',
   'PRD-021', '§3 Sprint 15', 'project_coordinator', 'backlog', 'high', 16, 7),

  ('a0000015-0000-0000-0000-000000000015',
   '150-frame phone benchmark',
   'Gerçek sınıf, 3 aydınlatma. PRD-013 §7.2 son ¶ + ai-service/test-data/phone_benchmark.',
   'PRD-021', '§3 Sprint 15', 'project_coordinator', 'backlog', 'medium', 6, 8),

  ('a0000015-0000-0000-0000-000000000015',
   'YOLOv8n fine-tune v1.0',
   'Merge datasets v1.0 → Colab T4, 50 epoch.',
   'PRD-021', '§3 Sprint 15', 'ai_backend', 'backlog', 'high', 6, 9),

  ('a0000015-0000-0000-0000-000000000015',
   'Benchmark + ai_models registry',
   'Başarılıysa staged. Activate=false.',
   'PRD-021', '§3 Sprint 15', 'ai_backend', 'backlog', 'medium', 4, 10),

  ('a0000015-0000-0000-0000-000000000015',
   'A/B test stock vs v1.0',
   '48h shadow inference. FP/saat karşılaştırması.',
   'PRD-021', '§3 Sprint 15', 'ai_backend', 'backlog', 'high', 4, 11),

  ('a0000015-0000-0000-0000-000000000015',
   'Fallback augmentation (Objects365 + LVIS)',
   'Yalnızca v1.0 yetersiz çıkarsa. Long-tail wristwatch, eraser, pen.',
   'PRD-021', '§3 Sprint 15', 'ai_backend', 'backlog', 'low', 4, 12);

-- ─────────────────────────────────────────────────────────────────────────
-- 5) BACKLOG ITEMS — Sprint 16: Paper Notes & Kalemlik & Hesap Makinesi
-- ─────────────────────────────────────────────────────────────────────────

insert into public.backlog_items (sprint_id, title, description, prd_id, prd_section, dev_role, status, priority, estimated_hours, sort_order)
values
  ('a0000016-0000-0000-0000-000000000016',
   'Senaryo şartnamesi S1 + S6',
   'docs/dataset-plan §5.2.1 (6 alt-senaryo) + §5.2.6 (6 negatif). RİSKLİ sprint — senaryo çeşitliliği kritik.',
   'PRD-021', '§3 Sprint 16', 'project_coordinator', 'backlog', 'high', 4, 1),

  ('a0000016-0000-0000-0000-000000000016',
   'Capture: 3 kişi × 6 senaryo × 3 aydınlatma × 2 kamera',
   '~108 clip. Cep / kalemlik içi / sıra altı / manşet / su şişesi / sıra altına yapıştırılmış.',
   'PRD-021', '§3 Sprint 16', 'project_coordinator', 'backlog', 'high', 16, 2),

  ('a0000016-0000-0000-0000-000000000016',
   'Frame extraction (2 FPS) + pre-label',
   '~600 ham frame, YOLOv8 auto-label pre-pass.',
   'PRD-021', '§3 Sprint 16', 'ai_backend', 'backlog', 'high', 14, 3),

  ('a0000016-0000-0000-0000-000000000016',
   'Pencil case dataset',
   'Open Images V7 (~1500) + iç-veri 200 frame.',
   'PRD-021', '§3 Sprint 16', 'ai_backend', 'backlog', 'medium', 4, 4),

  ('a0000016-0000-0000-0000-000000000016',
   'Calculator dataset',
   'Open Images V7 + Roboflow + iç-veri.',
   'PRD-021', '§3 Sprint 16', 'ai_backend', 'backlog', 'medium', 4, 5),

  ('a0000016-0000-0000-0000-000000000016',
   'Negative mining — meşru kağıt yazma',
   'FP önleme. paper_notes ile karışmamalı.',
   'PRD-021', '§3 Sprint 16', 'ai_backend', 'backlog', 'high', 8, 6),

  ('a0000016-0000-0000-0000-000000000016',
   'Roboflow scout — cheat sheet / hidden notes',
   'Varsa indir; community kalitesi değişken.',
   'PRD-021', '§3 Sprint 16', 'ai_backend', 'backlog', 'low', 4, 7),

  ('a0000016-0000-0000-0000-000000000016',
   'Merge datasets v2.0',
   '+ paper_notes, pencil_case, calculator sınıfları.',
   'PRD-021', '§3 Sprint 16', 'ai_backend', 'backlog', 'high', 4, 8),

  ('a0000016-0000-0000-0000-000000000016',
   'Fine-tune v2.0 + A/B vs v1.0',
   'Önceki sınıflarda regresyon olmamalı.',
   'PRD-021', '§3 Sprint 16', 'ai_backend', 'backlog', 'high', 6, 9),

  ('a0000016-0000-0000-0000-000000000016',
   'Benchmark + admin onayı + staged deploy',
   'Canlı shadow 48h öncesi promote etme.',
   'PRD-021', '§3 Sprint 16', 'project_coordinator', 'backlog', 'medium', 6, 10);

-- ─────────────────────────────────────────────────────────────────────────
-- 6) BACKLOG ITEMS — Sprint 17: Pose & Davranış & Gaze Refinement
-- ─────────────────────────────────────────────────────────────────────────

insert into public.backlog_items (sprint_id, title, description, prd_id, prd_section, dev_role, status, priority, estimated_hours, sort_order)
values
  ('a0000017-0000-0000-0000-000000000017',
   'MediaPipe Pose extractor (33 keypoint per track)',
   'pose_extractor.py — per track_id, frame → 33 keypoint.',
   'PRD-021', '§3 Sprint 17', 'ai_backend', 'backlog', 'high', 6, 1),

  ('a0000017-0000-0000-0000-000000000017',
   'body_lean_neighbor kuralı',
   'Torso açısı > 20° + komşu koltuk yön kalibrasyonu (PRD-013 §3.6).',
   'PRD-021', '§3 Sprint 17', 'ai_backend', 'backlog', 'high', 8, 2),

  ('a0000017-0000-0000-0000-000000000017',
   'standing_up kuralı',
   'Omuz/kalça y-koord %30+ delta, sustained 2s.',
   'PRD-021', '§3 Sprint 17', 'ai_backend', 'backlog', 'medium', 6, 3),

  ('a0000017-0000-0000-0000-000000000017',
   'hand_under_desk kuralı',
   'El y > masa segment y, sustained 5s. Kalem düşürme ile karışmamalı.',
   'PRD-021', '§3 Sprint 17', 'ai_backend', 'backlog', 'high', 8, 4),

  ('a0000017-0000-0000-0000-000000000017',
   'hand_to_ear_mouth kuralı',
   'El-yüz mesafesi < 50px, sustained 2s. HaGRID call gesture pretrain.',
   'PRD-021', '§3 Sprint 17', 'ai_backend', 'backlog', 'medium', 6, 5),

  ('a0000017-0000-0000-0000-000000000017',
   'İç-controlled capture S5',
   '5 davranış × 3 kişi × 2 koltuk = ~30 clip.',
   'PRD-021', '§3 Sprint 17', 'project_coordinator', 'backlog', 'high', 10, 6),

  ('a0000017-0000-0000-0000-000000000017',
   'Annotation (frame-level action labels)',
   'CVAT batch UI.',
   'PRD-021', '§3 Sprint 17', 'project_coordinator', 'backlog', 'medium', 8, 7),

  ('a0000017-0000-0000-0000-000000000017',
   'Opsiyonel — AVA Actions subset',
   'hand_pass_object class''ı. Alternatif: NTU RGB+D 120 (ST-GCN) veya Kinetics-700 (SlowFast).',
   'PRD-021', '§3 Sprint 17', 'ai_backend', 'backlog', 'low', 6, 8),

  ('a0000017-0000-0000-0000-000000000017',
   'object_passing kuralı',
   'İki track el yakınlaşması + sustained 1-3s.',
   'PRD-021', '§3 Sprint 17', 'ai_backend', 'backlog', 'medium', 6, 9),

  ('a0000017-0000-0000-0000-000000000017',
   'Fargate resource bump',
   '2048 → 3072 CPU, 6144 → 7168 MB. Pose ek yük için.',
   'PRD-021', '§3 Sprint 17', 'ai_backend', 'backlog', 'medium', 6, 10),

  ('a0000017-0000-0000-0000-000000000017',
   'gaze_at_lap kuralı',
   'Pitch açısı aşağı (kucağa) + sustained 5s + bbox lap region overlap → severity boost.',
   'PRD-021', '§3 Sprint 17', 'ai_backend', 'backlog', 'high', 4, 11),

  ('a0000017-0000-0000-0000-000000000017',
   'gaze_at_neighbor direction calibration',
   'Sprint 8 generic gaze diversion''u PRD-013 §3.6 koltuk geometrisine bağla; sol/sağ komşu yönüne filtre.',
   'PRD-021', '§3 Sprint 17', 'ai_backend', 'backlog', 'high', 6, 12),

  ('a0000017-0000-0000-0000-000000000017',
   'synchronized_behavior kuralı',
   'Multi-track temporal correlation: iki komşu öğrenci 2s içinde aynı yöne, tekrarlı (5dk içinde 3+).',
   'PRD-021', '§3 Sprint 17', 'ai_backend', 'backlog', 'medium', 6, 13),

  ('a0000017-0000-0000-0000-000000000017',
   'Stretch — L2CS-Net gaze fallback',
   'MediaPipe Face Mesh pitch kucağa-bakma için yetersizse drop-in (Gaze360 pretrained).',
   'PRD-021', '§3 Sprint 17', 'ai_backend', 'backlog', 'low', 4, 14);

-- ─────────────────────────────────────────────────────────────────────────
-- 7) BACKLOG ITEMS — Sprint 18: Multi-Camera Fusion + Face Covering
-- ─────────────────────────────────────────────────────────────────────────

insert into public.backlog_items (sprint_id, title, description, prd_id, prd_section, dev_role, status, priority, estimated_hours, sort_order)
values
  ('a0000018-0000-0000-0000-000000000018',
   'PRD-013 §3.8 multi-cam coordinator implementation',
   'multi_camera_fusion.py — gerçek implementasyon.',
   'PRD-021', '§3 Sprint 18', 'ai_backend', 'backlog', 'high', 10, 1),

  ('a0000018-0000-0000-0000-000000000018',
   'Cross-camera Re-ID',
   'Market-1501 üzerinde OSNet/TransReID pretrained. Fallback: MSMT17 veya CUHK03 cross-domain düşerse.',
   'PRD-021', '§3 Sprint 18', 'ai_backend', 'backlog', 'high', 6, 2),

  ('a0000018-0000-0000-0000-000000000018',
   'Person re-id embedder service',
   'track_id × camera × embedding cache.',
   'PRD-021', '§3 Sprint 18', 'ai_backend', 'backlog', 'high', 8, 3),

  ('a0000018-0000-0000-0000-000000000018',
   'Multi-camera person matcher',
   'cosine sim > 0.7 → unified person_id across cameras.',
   'PRD-021', '§3 Sprint 18', 'ai_backend', 'backlog', 'high', 8, 4),

  ('a0000018-0000-0000-0000-000000000018',
   'İç multi-cam capture',
   'cam-pair token ile 2 telefon, 3 senaryo × 4 kişi = test seti.',
   'PRD-021', '§3 Sprint 18', 'project_coordinator', 'backlog', 'high', 8, 5),

  ('a0000018-0000-0000-0000-000000000018',
   'Severity fusion',
   'Tek = original; 2+ kamera onay = +1 severity tier.',
   'PRD-021', '§3 Sprint 18', 'ai_backend', 'backlog', 'medium', 4, 6),

  ('a0000018-0000-0000-0000-000000000018',
   'Kamera overlap zone UI',
   'Çakışma bölgesi marker pin + kalibrasyon.',
   'PRD-021', '§3 Sprint 18', 'portal_frontend', 'backlog', 'high', 12, 7),

  ('a0000018-0000-0000-0000-000000000018',
   'LiveMonitor refactor — multi-cam grid',
   'LiveMonitor.tsx:27-34 "Pick first session" demo flag kaldır, framesByCamera Map''i unlock et, grid layout.',
   'PRD-021', '§3 Sprint 18', 'portal_frontend', 'backlog', 'high', 6, 8),

  ('a0000018-0000-0000-0000-000000000018',
   'Çapraz-doğrulama benchmark',
   'Tek-cam vs 2-cam precision karşılaştırması.',
   'PRD-021', '§3 Sprint 18', 'project_coordinator', 'backlog', 'medium', 7, 9),

  ('a0000018-0000-0000-0000-000000000018',
   'Detection worker pool (Sprint 13 fallback)',
   'Sprint 13''ten ötelenmişse — cross-cam fusion zaten queue ister.',
   'PRD-021', '§3 Sprint 18', 'ai_backend', 'backlog', 'medium', 8, 10),

  ('a0000018-0000-0000-0000-000000000018',
   'face_covering — MaskedFace-Net + WIDER FACE',
   'Maske/cap ile kimlik gizleme tespiti. CC-BY-NC: production''da iç-veri ile değiştir. sustained 30s+ kuralı.',
   'PRD-021', '§3 Sprint 18', 'ai_backend', 'backlog', 'high', 8, 11);
