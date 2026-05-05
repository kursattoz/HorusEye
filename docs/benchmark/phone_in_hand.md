# Phone-in-hand benchmark methodology — BL-193

Phase A deploy precondition (PRD-013 §7.2 son paragrafı). Bu doküman
**ne ölçüyoruz**, **nasıl ölçüyoruz**, **ne zaman pass demek için
yeterli** sorularını yanıtlar.

## Scope

| Component         | Phase A measurement | Phase B follow-up                      |
|-------------------|---------------------|----------------------------------------|
| YOLO phone detect | precision / recall  | confidence calibration (Sprint 9)      |
| YOLO person count | recall              | seat-bound count (Sprint 9 §3.6)       |
| `phone_in_hand`   | n/a (single-frame)  | sustained-overlap precision (Sprint 9) |

Sprint 7 yalnızca **detection** seviyesinde değer ölçer; rule-level
metrics 5 FPS streaming gerektirir, Sprint 9'da end-to-end e2e harness
ile ölçülür.

## Acceptance gates

| Metric           | Threshold |
|------------------|-----------|
| phone precision  | ≥ 0.80    |
| person recall    | ≥ 0.95    |

(Lab koşullarında YOLOv8n için %92-94 phone precision rapor edilir;
gerçek sınıf ortamında %75-85 beklentisi var. %80 minimum kabul.)

## Procedure

1. Capture & label per `ai-service/test-data/phone_benchmark/README.md`.
2. Run:
   ```bash
   python -m scripts.benchmark_phone \
       --data-dir test-data/phone_benchmark \
       --ground-truth test-data/phone_benchmark/ground_truth.json \
       --output build/benchmark_phone.json
   ```
3. Inspect output JSON. `pass=true` ise deploy iznini al.
4. `pass=false` durumda:
   - `phone.fp` yüksekse → confidence threshold artır (config.yaml `detection.confidence_threshold`)
   - `phone.fn` yüksekse → confidence threshold düşür VEYA Sprint 9 custom-train kickoff
   - `person.fn` yüksekse → kameranın açısı/zoom ayarı kontrol; pencere yansıması filtre

## Failure mode catalogue

| Symptom | Likely cause | Fix |
|---|---|---|
| Phone FN > 5 | Telefon küçük (>5m mesafe) | Yakın çekim kameraya geç ya da custom train |
| Phone FP > 5 | Sıradaki tabletler / kalemkutusu | Kontrol — confidence düşür değil; class filter |
| Person FN > 5 | Pencere yansıması / arka plan | Kamera açısı yeniden ayarla |
| Tek lighting bucket'ta düşüş | Floresan flicker / aşırı parlaklık | Otomatik beyaz dengesi; kamera exposure |

## Storing the report

Sprint 9 BL-9-07 (`ai_models` tablosu) ile entegre olduktan sonra her
deploy öncesi benchmark çıktısı şu satıra yazılır:

```sql
INSERT INTO public.ai_models (name, version, weights_path, benchmark_results, trained_on)
VALUES ('yolov8n-coco', 'v0.1.0-phase-a', 'models/yolov8n.pt',
        '<benchmark_phone.json contents>'::jsonb, NOW());
```

Şu an (Sprint 7) tablo henüz yok; raporu repo'nun `build/` klasörüne
yazıp PR'a iliştir, audit trail için `audit_logs.action` üzerinde
`benchmark_run` event tipi kullan (PRD-006).
