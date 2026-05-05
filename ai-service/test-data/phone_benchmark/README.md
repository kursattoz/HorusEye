# Phone benchmark dataset — BL-193

Capture **150 frames** total — 50 frames in each of three lighting conditions
(PRD-013 §7.2 son paragrafı):

| Bucket | Lighting | Recommended capture window |
|---|---|---|
| `morning_sun`    | Pencereden direkt ışık (8–10 AM)   | 50 frames |
| `noon_balanced`  | Tavan + dış ışık dengesi (11 AM – 2 PM) | 50 frames |
| `evening_fluoro` | Sadece floresan tavan ışığı (akşam) | 50 frames |

## Recording

1. Telefonu sınıf önündeki tripoda yerleştir, **3-5 m** uzaklıkta her sıraya bak.
2. 5 FPS'de kayıt al, her bucket'tan 50 frame seç (10 saniyelik bir çekim).
3. Frame'leri JPEG olarak şu klasöre kopyala: `lighting{1,2,3}_{nnn}.jpg`.

## Ground truth

`ground_truth.json` dosyasını manuel etiketle. Şema için
`ground_truth.example.json` referans alınabilir. Her frame için:

* `filename` — disk adı
* `lighting` — `morning_sun` / `noon_balanced` / `evening_fluoro`
* `people` — frame'de görünen kişi sayısı (sınıf kapasitesi DEĞİL — kameraya yakalanan kafa sayısı)
* `phone_visible` — herhangi bir telefon (sıradan görünür) `true` / `false`

> Etkin etiketleyici: 150 frame ≈ 30-45 dakika.

## Çalıştırma

```bash
cd ai-service
python -m scripts.benchmark_phone \
    --data-dir test-data/phone_benchmark \
    --ground-truth test-data/phone_benchmark/ground_truth.json \
    --output build/benchmark_phone.json
```

Exit code 0 = pass (phone precision ≥ 0.80 AND person recall ≥ 0.95).
Sonuç JSON'u Sprint 9'da `ai_models.benchmark_results` JSONB kolonuna
yüklenir.
