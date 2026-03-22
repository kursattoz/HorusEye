# PRD-017 — Veri Seti Stratejisi & Model Eğitim Pipeline'ı
**Versiyon:** 1.1
**Owner:** HorusEye Team
**Bağımlılıklar:** PRD-000, PRD-013
**Blocks:** —
**Durum:** DRAFT → AKTIF (Phase A.1 başladığında)
**Feature Flag:** `NEXT_PUBLIC_CAMERA_MODULE_ENABLED=true` (PRD-013 ile paylaşımlı)

---

<!-- INTERFACE_DEPS
AuthUser: @1.1
LogEvent: @1.2
-->

## ⚠️ LLM TALİMATI
Bu PRD, PRD-013'ün §14 (Veri Seti Stratejisi & Model Yönetimi) bölümünün detaylı implementasyon spesifikasyonudur.
PRD-013 **ne yapılacağını** tanımlar, bu PRD **nasıl yapılacağını** tanımlar.
AI pipeline mimarisi, tespit kategorileri, fine-tuning UI akışı ve model A/B testing PRD-013'te kalır.
Bu PRD sadece: veri edinme → dönüşüm → temizleme → birleştirme → augmentation → eğitim → değerlendirme pipeline'ını kapsar.

---

## 1. Amaç

PRD-013 Phase A'da COCO pre-trained model ile sıfır eğitim yaklaşımı tanımlar. Phase A.1'den itibaren custom eğitim gereklidir. Bu PRD, custom eğitim için:

- Harici veri setlerinin nereden ve nasıl edinileceğini
- İndirilen verilerin nasıl dönüştürülüp temizleneceğini
- Sınıf ortamından otomatik toplanan verinin nasıl işleneceğini
- Tüm kaynakların nasıl birleştirileceğini
- Eğitim pipeline'ının adım adım nasıl çalışacağını
- Model kalitesinin nasıl değerlendirileceğini

spesifiye eder.

---

## 2. PRD-013 İlişkisi & Kapsam

| Konu | PRD-013 | PRD-017 (bu dosya) |
|------|---------|---------------------|
| Tespit sınıfları & doğruluk hedefleri | §7.2 ✅ | Referans alır |
| AI pipeline mimarisi | §3.1-3.3 ✅ | Referans alır |
| Fine-tuning UI & model versiyonlama | §14.4 ✅ | Referans alır |
| Model A/B testing | §14.5 ✅ | Referans alır |
| Compute seçenekleri (Colab/Kaggle) | §14.4 ✅ | Referans alır |
| **Harici dataset detayları** | §14.2 (sadece liste) | **Bu PRD ✅** |
| **İndirme & format dönüşüm** | Yok | **Bu PRD ✅** |
| **Veri temizleme & kalite standartları** | Yok | **Bu PRD ✅** |
| **Data augmentation config** | Yok | **Bu PRD ✅** |
| **Dataset birleştirme & class mapping** | Yok | **Bu PRD ✅** |
| **Dataset versiyonlama** | Yok | **Bu PRD ✅** |
| **Train/val/test split** | Yok | **Bu PRD ✅** |
| **Otomatik veri toplama detayları** | §14.5 (özet) | **Bu PRD ✅** |
| **End-to-end eğitim pipeline** | Yok | **Bu PRD ✅** |

---

## 3. Tespit Sınıfları & Veri İhtiyaç Matrisi

PRD-013 §7.2 ve §14.1'den derlenen, eğitim verisi gerektiren tespit sınıfları:

| Tespit Sınıfı | COCO Pre-trained | Custom Eğitim | Phase | Veri İhtiyacı |
|---------------|-----------------|---------------|-------|---------------|
| `person` (kişi) | ✅ class #0 | ❌ gereksiz | A | — |
| `cell_phone` (telefon) | ✅ class #67 | ⚠️ fine-tune önerilir | A.1 | Sınıf ortamı görselleri (masanın altında, kucakta, yarı örtülü) |
| `earbuds` (kulaklık) | ❌ | ✅ zorunlu | B | Harici dataset + sınıf ortamı görselleri |
| `book` (kitap) | ✅ class #73 | ⚠️ fine-tune önerilir | B | Sınıf masası üzerinde kitap/not görselleri |
| `paper_notes` (kopya kağıdı) | ❌ | ✅ zorunlu | B | Custom annotation (kontrollü test ortamı) |

**COCO Domain Bias Detayı (PRD-013 §14.1'den):**

COCO'daki `cell_phone` class'ı sokak/ofis ortamında eğitilmiştir. Sınıf ortamındaki farklılıklar:
- Öğrenci telefonu masanın altında tutar (kısmen örtülü)
- Telefon kılıfı renkleri masa rengine yakın olabilir
- Telefon ekranı kapalı olabilir

Bu yüzden Phase A.1'de sınıf ortamı verisi ile fine-tune gerekir.

---

## 4. Harici Veri Kaynakları

### 4.1 Kaynak Kataloğu

#### A) Roboflow Universe

| Arama Terimi | Hedef Sınıf | Beklenen Sonuç | Kullanım |
|-------------|-------------|----------------|----------|
| `"earbuds detection"` | earbuds | 5-15 dataset, 500-5000 görsel | Kulaklık tespiti — birincil kaynak |
| `"airpods detection"` | earbuds | 3-10 dataset | AirPods spesifik — ek kaynak |
| `"wireless earbuds"` | earbuds | 2-5 dataset | Kablosuz kulaklık varyasyonları |
| `"phone detection classroom"` | cell_phone | 1-3 dataset | Sınıf ortamı telefon — varsa bonus |
| `"cheating detection"` | mixed | 1-5 dataset | Kopya tespiti genel — dikkatli filtre |

**Roboflow indirme yöntemi:**
```bash
# Roboflow CLI ile (API key gerekli)
pip install roboflow
python -c "
from roboflow import Roboflow
rf = Roboflow(api_key='ROBOFLOW_API_KEY')
project = rf.workspace('WORKSPACE').project('PROJECT_NAME')
dataset = project.version(VERSION).download('yolov8')
"

# Veya web üzerinden: Export → YOLOv8 format → ZIP indir
```

**Roboflow dataset seçim süreci:**
```
1. universe.roboflow.com'da arama terimi gir
2. Sonuçları filtrele:
   - "Images" > 500
   - "License" = CC-BY-4.0 veya açık
   - "Format" = YOLOv8 desteği var
   - "Health Check" ≥ %70 (Roboflow'un otomatik kalite skoru)
3. İlk 3-5 sonucun önizlemesine bak:
   - Görseller sınıf ortamına uygun mu? (düz arka plan, masa üstü, kulak yakını)
   - Annotation kalitesi iyi mi? (bbox'lar doğru çizilmiş mi)
   - Class dağılımı dengeli mi?
4. En uygun 1-2 dataset'i indir
5. Kalite doğrulamasından geçir (§6)
```

#### B) Open Images V7 (Google)

| Class | OID Class ID | Toplam Görsel | Kullanım |
|-------|-------------|---------------|----------|
| `Headphones` | `/m/04brg2` | ~5000+ | Kulaklık ek kaynak |
| `Mobile phone` | `/m/050k8` | ~10000+ | Telefon augmentation |
| `Book` | `/m/0bt_c3` | ~8000+ | Kitap/not fine-tune |

**Open Images indirme yöntemi:**
```bash
# FiftyOne kütüphanesi ile (önerilen — filtreli indirme)
pip install fiftyone

python -c "
import fiftyone as fo
import fiftyone.zoo as foz

dataset = foz.load_zoo_dataset(
    'open-images-v7',
    split='train',
    label_types=['detections'],
    classes=['Headphones', 'Mobile phone'],
    max_samples=2000,          # İlk aşama için 2000 yeterli
    dataset_name='oid_headphones_phone'
)
dataset.export(
    export_dir='./data/raw/open_images/',
    dataset_type=fo.types.YOLOv5Dataset  # YOLOv8 uyumlu
)
"

# Alternatif: OIDv4 Toolkit
pip install openimages
oid_download_dataset --classes Headphones --type_csv train --limit 2000
```

**⚠️ OID format dönüşümü gerekli:** Open Images kendi annotation formatını kullanır (CSV). FiftyOne otomatik YOLO formatına çevirir. Manuel kullanılıyorsa §5.2'deki dönüşüm script'i gerekli.

#### C) Kaggle

| Dataset Adayları | Arama Terimi | Kullanım |
|-----------------|-------------|----------|
| Sınav kopya tespiti | `"exam cheating detection"` | Eğer varsa — sınıf ortamı görselleri |
| Telefon tespiti | `"phone detection"` | Telefon fine-tune ek kaynak |
| Nesne tespiti genel | `"object detection classroom"` | Varsa — sınıf ortamı arka planları |

**Kaggle indirme:**
```bash
pip install kaggle
# ~/.kaggle/kaggle.json API token gerekli

kaggle datasets download -d DATASET_OWNER/DATASET_NAME
unzip DATASET_NAME.zip -d ./data/raw/kaggle/
```

**⚠️ Kaggle uyarısı:** Kaggle dataset'leri format ve kalite açısından çok değişken. Her dataset indirildikten sonra §6'daki kalite doğrulamasından geçmeli. Lisans her dataset'te farklı — ticari kullanım kısıtlamasını kontrol et.

#### D) COCO Dataset (Mevcut Sınıflar)

COCO pre-trained zaten kullanılıyor (PRD-013 §14.1). Fine-tune için COCO'dan ek veri çekmek gerekirse:

```bash
# FiftyOne ile COCO subset
python -c "
import fiftyone as fo
import fiftyone.zoo as foz

dataset = foz.load_zoo_dataset(
    'coco-2017',
    split='train',
    label_types=['detections'],
    classes=['cell phone', 'book'],
    max_samples=1000,
    dataset_name='coco_phone_book'
)
dataset.export(
    export_dir='./data/raw/coco_subset/',
    dataset_type=fo.types.YOLOv5Dataset
)
"
```

### 4.2 Dataset Seçim Kriterleri

Herhangi bir kaynaktan dataset seçerken uygulanacak minimum kriterler:

| Kriter | Minimum | İdeal | Gerekçe |
|--------|---------|-------|---------|
| **Toplam görsel sayısı** | 500 | 2000+ | 500 altı overfitting riski |
| **Annotation formatı** | YOLO, COCO, VOC | YOLO (dönüşüm gereksiz) | Dönüşüm hatası riski azalır |
| **Annotation kalitesi** | Gözle %80+ doğru | %95+ | Gürültülü etiket → gürültülü model |
| **Class başına minimum** | 200 görsel | 500+ | Class imbalance sorunu |
| **Görsel çözünürlük** | 320×320 px | 640+ px | YOLO input size 640 |
| **Lisans** | CC-BY veya daha açık | CC0 (public domain) | Hukuki risk yok |
| **Ortam benzerliği** | Genel nesne tespiti | Sınıf/ofis ortamı | Domain gap azalır |

**Red flag'ler (dataset'i KULLANMA):**
- Annotation'ların büyük çoğunluğu yanlış veya eksik
- Tek bir açıdan/ortamdan çekilmiş (diversity yok)
- Watermark veya gizlilik ihlali içeren görseller
- Lisansı belirsiz veya ticari kullanımı yasaklayan

### 4.3 Lisans Uyumluluğu

| Lisans | Kullanılabilir mi? | Koşul |
|--------|-------------------|-------|
| CC0 (Public Domain) | ✅ Sınırsız | — |
| CC-BY-4.0 | ✅ | Kaynak belirtme (dataset metadata'da) |
| CC-BY-SA-4.0 | ⚠️ Dikkatli | Türetilen model de aynı lisansla paylaşılmalı |
| CC-BY-NC | ❌ Üniversite projesi için gri alan | Ticari olmayan kullanım — üniversite projesi kabul edilebilir ama dağıtımda dikkat |
| Apache 2.0 / MIT | ✅ | — |
| GPL / AGPL | ⚠️ | Model dağıtılıyorsa kaynak kod paylaşımı gerekebilir |
| Belirsiz / Yok | ❌ | Kullanma |

**Not:** YOLOv8 (Ultralytics) AGPL-3.0 lisanslıdır. AI servisini izole container'da açık kaynak tutmak veya Enterprise License almak gerekir (PRD-013 §4.1). Dataset lisansı bağımsız bir konudur.

---

## 5. Veri İndirme & Format Dönüşüm Pipeline'ı

### 5.1 Standart Klasör Yapısı

Tüm dataset'ler indirildikten sonra bu yapıya dönüştürülür:

```
ai-service/data/
├── raw/                          # Ham indirilen veriler (format karışık)
│   ├── roboflow_earbuds_v1/
│   ├── open_images_headphones/
│   └── kaggle_phone_detect/
│
├── converted/                    # YOLO formatına dönüştürülmüş
│   ├── earbuds_roboflow/
│   │   ├── images/
│   │   │   ├── train/
│   │   │   ├── val/
│   │   │   └── test/
│   │   ├── labels/
│   │   │   ├── train/
│   │   │   ├── val/
│   │   │   └── test/
│   │   └── data.yaml
│   └── headphones_oid/
│       ├── images/
│       ├── labels/
│       └── data.yaml
│
├── merged/                       # Birleştirilmiş final dataset
│   └── v1_earbuds_phone_book/
│       ├── images/
│       │   ├── train/
│       │   ├── val/
│       │   └── test/
│       ├── labels/
│       │   ├── train/
│       │   ├── val/
│       │   └── test/
│       ├── data.yaml             # Birleşik class listesi
│       └── dataset_meta.json     # Kaynak bilgisi, versiyon, istatistikler
│
├── internal/                     # Sınıf ortamından toplanan veri
│   ├── positives/                # Proctor flag/violation
│   ├── negatives/                # Proctor dismiss
│   ├── unreviewed/               # Tepki verilmemiş (manuel review gerekir)
│   └── controlled_tests/         # Kontrollü test ortamı çekimleri
│
└── exports/                      # Fine-tuning UI'dan export edilen paketler
    └── training_job_{id}/
```

### 5.2 Format Dönüşüm

#### YOLO Format Hedef Yapısı

```
dataset_name/
├── images/
│   ├── train/
│   │   ├── img_0001.jpg
│   │   └── ...
│   ├── val/
│   └── test/
├── labels/
│   ├── train/
│   │   ├── img_0001.txt      # Her satır: class_id x_center y_center width height (normalized 0-1)
│   │   └── ...
│   ├── val/
│   └── test/
└── data.yaml
    # path: ./
    # train: images/train
    # val: images/val
    # test: images/test
    # names:
    #   0: earbuds
    #   1: phone
    #   ...
```

#### Dönüşüm Script'leri

```python
# ai-service/scripts/convert_dataset.py
# Kullanım: python convert_dataset.py --source ./data/raw/X --target ./data/converted/X --format {coco_json|pascal_voc|oid_csv|roboflow}

# Desteklenen kaynak formatları → YOLO dönüşüm:

# 1. COCO JSON → YOLO
#    Girdi: annotations.json + images/
#    Her annotation: {"bbox": [x, y, w, h], "category_id": N}
#    Çıktı: class_id x_center y_center w h (normalized)

# 2. Pascal VOC XML → YOLO
#    Girdi: her görsel için .xml dosyası
#    Her annotation: <bndbox><xmin>...<ymax></bndbox>
#    Çıktı: normalized YOLO format

# 3. Open Images CSV → YOLO
#    Girdi: {split}-annotations-bbox.csv + images/
#    Her satır: ImageID, Source, LabelName, Confidence, XMin, XMax, YMin, YMax
#    XMin/XMax/YMin/YMax zaten 0-1 normalized → YOLO'ya direkt dönüşür

# 4. Roboflow Export → YOLO
#    Roboflow "YOLOv8" format seçilirse dönüşüm gereksiz.
#    Başka format seçildiyse: Roboflow kendi dönüşümünü yapar (re-export önerilir).
```

**Dönüşüm doğrulama:** Her dönüşümden sonra rastgele 10 görsel seçilip bbox'lar görselleştirilir. Script otomatik olarak `converted/{dataset}/validation_samples/` klasörüne 10 annotated görsel kaydeder. Geliştirici gözle doğrular.

### 5.3 Toplu İndirme & Dönüşüm Akışı

```
Adım 1: Kaynak seçimi
  → §4.2 kriterlerine göre dataset belirle
  → Lisans kontrolü (§4.3)

Adım 2: İndirme
  → python scripts/import_dataset.py \
      --source roboflow \
      --query "earbuds detection" \
      --workspace WORKSPACE \
      --project PROJECT \
      --version VERSION \
      --output ./data/raw/roboflow_earbuds_v1/

Adım 3: Format dönüşüm
  → python scripts/convert_dataset.py \
      --source ./data/raw/roboflow_earbuds_v1/ \
      --target ./data/converted/earbuds_roboflow/ \
      --format roboflow \
      --class-map '{"earbuds": 0}'

Adım 4: Kalite doğrulama (§6)
  → python scripts/validate_dataset.py \
      --path ./data/converted/earbuds_roboflow/ \
      --min-images 500 \
      --min-resolution 320

Adım 5: Veritabanına kayıt
  → POST /api/ai/datasets/import (metadata)
```

---

## 6. Veri Temizleme & Kalite Standartları

### 6.1 Minimum Kalite Eşikleri

| Kriter | Eşik | Başarısız Olursa |
|--------|------|-----------------|
| **Görsel çözünürlük** | Her iki kenar ≥ 320px | Görsel çıkarılır |
| **Bbox minimum boyut** | En az 16×16 piksel | Annotation çıkarılır |
| **Bbox sınır kontrolü** | 0 ≤ x,y,w,h ≤ 1.0 (YOLO normalized) | Annotation düzeltilir (clamp) veya çıkarılır |
| **Bbox alan oranı** | w×h ≥ 0.001 (görsel alanının %0.1'i) | Çok küçük annotation çıkarılır |
| **Bulanıklık skoru** | Laplacian variance > 30 | Görsel çıkarılır |
| **Karanlık/parlak** | Ortalama piksel 20-245 arasında | Görsel çıkarılır |
| **Bozuk dosya** | JPEG/PNG decode başarılı | Dosya çıkarılır |
| **Duplicate** | Perceptual hash ile kontrol | Kopya çıkarılır |
| **Annotation/görsel eşleşmesi** | Her görsel için label dosyası var | Eşleşmeyen çıkarılır veya negatif örnek olarak tutulur |

### 6.2 Sınıf Ortamı Uygunluk Filtreleri

Harici dataset'ler genel ortamdan gelir. Sınıf ortamına uygunluk filtresi:

| Filtre | Açıklama | Uygulama |
|--------|----------|----------|
| **Arka plan çeşitliliği** | Tek tip arka plan (beyaz studio) veri setleri tercih edilmez | Manuel kontrol — %80+ farklı arka plan |
| **Nesne boyut dağılımı** | Çok büyük (ekranı kaplayan) veya çok küçük (<16px) nesneler | Histogram analiz → outlier'ları çıkar |
| **Açı çeşitliliği** | Sadece frontal/üstten çekilmiş veriler yeterli değil | Manuel kontrol — yan, üst, çapraz açılar mevcut olmalı |
| **Occlusion çeşitliliği** | Kısmen örtülü nesneler sınıf ortamında yaygın | Tercih: kısmen örtülü örnekler (%20+ occlusion) |
| **Aydınlatma çeşitliliği** | Farklı ışık koşulları | Histogram analiz — brightness dağılımı geniş olmalı |

### 6.3 Doğrulama Script'i

```bash
python scripts/validate_dataset.py \
  --path ./data/converted/earbuds_roboflow/ \
  --min-images 500 \
  --min-resolution 320 \
  --min-bbox-pixels 16 \
  --check-blur \
  --check-duplicates \
  --output-report ./data/converted/earbuds_roboflow/quality_report.json
```

**Çıktı formatı (quality_report.json):**
```json
{
  "dataset_path": "./data/converted/earbuds_roboflow/",
  "total_images": 1247,
  "total_annotations": 2891,
  "passed": true,
  "issues": {
    "removed_low_resolution": 23,
    "removed_corrupt": 2,
    "removed_blurry": 15,
    "removed_duplicate": 8,
    "removed_tiny_bbox": 31,
    "clamped_bbox": 5,
    "images_without_labels": 0
  },
  "after_cleanup": {
    "total_images": 1199,
    "total_annotations": 2826,
    "class_distribution": { "earbuds": 2826 },
    "avg_resolution": "724x648",
    "avg_bbox_area_ratio": 0.034,
    "brightness_range": [35, 228]
  }
}
```

---

## 7. Data Augmentation Stratejisi

### 7.1 YOLOv8 Built-in Augmentation Config

YOLOv8 eğitimi sırasında otomatik uygulanan augmentation'lar. Sınıf ortamına göre ayarlanmış değerler:

```yaml
# ai-service/configs/augmentation.yaml

# ── Renk Varyasyonları (aydınlatma farkları) ──
hsv_h: 0.015      # Hue ±1.5% — küçük renk kayması
hsv_s: 0.7        # Saturation ±70% — floresan vs güneş ışığı farkı
hsv_v: 0.4        # Value (brightness) ±40% — karanlık koridor vs pencere yanı

# ── Geometrik Dönüşümler ──
degrees: 10.0      # Rotasyon ±10° — kamera hafif eğik olabilir
translate: 0.1     # Kaydırma ±10% — nesne frame kenarında olabilir
scale: 0.5         # Ölçek ±50% — yakın (ön sıra) vs uzak (arka sıra) öğrenci
shear: 2.0         # Kesme ±2° — perspektif farklılığı
perspective: 0.001 # Perspektif bozulma — kamera açısı varyasyonu

# ── Flip ──
fliplr: 0.5        # Yatay flip %50 — simetrik, doğal
flipud: 0.0        # Dikey flip %0 — insanlar ters durmaz

# ── Mozaik & Karıştırma ──
mosaic: 1.0        # Mozaik augmentation %100 — 4 görsel birleştirilir
mixup: 0.1         # Mixup %10 — iki görsel şeffaf üst üste
copy_paste: 0.1    # Copy-paste %10 — bir görseldeki nesne başka görsele yapıştırılır

# ── Ek ──
erasing: 0.4       # Random erasing %40 — occlusion simülasyonu (masanın altında yarı görünürlük)
```

### 7.2 Sınıf Ortamına Özgü Ek Augmentation

YOLOv8'in built-in augmentation'ı dışında, sınıf ortamına özgü durumlar için ek augmentation pipeline'ı:

| Augmentation | Amaç | Uygulama |
|-------------|------|----------|
| **Parlaklık varyasyonu (agresif)** | Sınıfta pencere kenarı vs koridor farkı | `albumentations.RandomBrightnessContrast(brightness_limit=0.4)` |
| **Gürültü ekleme** | Düşük kalite kamera / düşük ışık | `albumentations.GaussNoise(var_limit=(10, 50))` |
| **JPEG sıkıştırma artifaktı** | RTSP stream sıkıştırma | `albumentations.ImageCompression(quality_lower=40, quality_upper=80)` |
| **Resize + pad** | Farklı kamera çözünürlükleri | 720p → 640×640 letterbox, 1080p → 640×640 letterbox |
| **Kısmi occlusion** | Öğrencinin eliyle telefonu/kulaklığı örtmesi | Random rectangle overlay (%20-60 alan, görselin rastgele bölgesinde) |

```python
# ai-service/scripts/augment_dataset.py
# Ek augmentation (opsiyonel, YOLOv8 built-in yeterli değilse)

import albumentations as A

exam_augmentation = A.Compose([
    A.RandomBrightnessContrast(brightness_limit=0.4, contrast_limit=0.3, p=0.5),
    A.GaussNoise(var_limit=(10, 50), p=0.3),
    A.ImageCompression(quality_lower=40, quality_upper=80, p=0.3),
    A.CoarseDropout(max_holes=3, max_height=0.15, max_width=0.15, p=0.3),  # occlusion
], bbox_params=A.BboxParams(format='yolo', label_fields=['class_labels']))
```

**⚠️ Dikkat:** YOLOv8'in kendi augmentation'ı çoğu durumda yeterlidir. Ek augmentation sadece benchmark sonrası (PRD-013 §14.3) belirli bir zayıflık tespit edilirse uygulanmalıdır. Örnek: "düşük ışıkta phone precision %60'a düşüyor" → ek gürültü + karanlık augmentation ekle.

---

## 8. Dataset Birleştirme

### 8.1 Class Mapping

Farklı kaynaklardaki farklı class isimleri tek bir class mapping'e dönüştürülür:

```yaml
# ai-service/configs/class_mapping.yaml

# Birleşik hedef class listesi (data.yaml'a yazılacak)
target_classes:
  0: earbuds
  1: phone
  2: book
  3: paper_notes

# Kaynak → hedef eşleştirme
source_mappings:
  roboflow_earbuds:
    "earbuds": 0
    "airpods": 0          # AirPods = earbuds
    "wireless_earbuds": 0 # Kablosuz kulaklık = earbuds
    "earbud": 0           # Tekil/çoğul fark

  open_images:
    "Headphones": 0       # Open Images "Headphones" → earbuds (yaklaşık eşleme)
    "Mobile phone": 1
    "Book": 2

  coco_subset:
    "cell phone": 1       # COCO class #67
    "book": 2             # COCO class #73

  internal:
    "phone": 1
    "earbuds": 0
    "notes": 3
    "cheat_sheet": 3      # Kopya kağıdı = paper_notes
```

**⚠️ Dikkat — "Headphones" ≠ "Earbuds":**
Open Images'taki "Headphones" class'ı büyük kulaklıkları (over-ear) da içerir. Sınav ortamında aranan küçük in-ear kulaklıklardır. Çözüm: OID "Headphones" indirildikten sonra **manuel filtreleme** — büyük kulaklık görselleri çıkarılır, sadece in-ear/earbud görselleri tutulur. Bu filtreleme §6.2 sürecinde yapılır.

### 8.2 Class Imbalance Çözümü

Farklı kaynaklardan gelen sınıfların dengesiz olması beklenir:

| Senaryo | Örnek | Çözüm |
|---------|-------|-------|
| **Fazla veri (>3000)** | phone: 5000 görsel | Random undersampling → hedef sayıya indir (class başına max 2000) |
| **Yeterli veri (500-3000)** | earbuds: 1200 görsel | Olduğu gibi kullan |
| **Az veri (<500)** | paper_notes: 150 görsel | Oversampling: augmentation ile artır (§7) VEYA daha fazla veri topla |
| **Çok az veri (<100)** | paper_notes: 50 görsel | **Eğitme.** Bu class'ı ilk eğitimden çıkar, daha fazla veri toplanana kadar bekle |

**Hedef class dağılımı:** Her class'ta **500-2000** görsel. ±%30 dengesizlik toleransı (örn: earbuds 1500, phone 1200, book 800 → kabul edilebilir).

**Class ağırlığı:** Eğitim sırasında dengesizlik için YOLOv8 `class_weights` parametresi kullanılabilir:
```python
# Eğitim komutu
yolo train data=data.yaml model=yolov8n.pt epochs=50 \
  # YOLOv8 focal loss ile otomatik dengeleme yapar
  # Manuel ağırlık gerekirse: custom training script
```

### 8.3 Merge Pipeline

```bash
python scripts/merge_datasets.py \
  --sources \
    ./data/converted/earbuds_roboflow/ \
    ./data/converted/headphones_oid/ \
    ./data/converted/coco_phone_book/ \
    ./data/internal/positives/ \
  --class-map ./configs/class_mapping.yaml \
  --output ./data/merged/v1_earbuds_phone_book/ \
  --max-per-class 2000 \
  --split-ratio 0.7:0.2:0.1
```

**Merge adımları:**
```
1. Her kaynak dataset'i oku
2. Class mapping uygula (kaynak class → hedef class)
3. Tüm görselleri ve label'ları birleştir
4. Class imbalance kontrolü: max-per-class aşanları random undersample
5. Train/val/test split uygula (§9)
6. data.yaml oluştur (birleşik class listesi)
7. dataset_meta.json oluştur (kaynak bilgisi, istatistikler)
8. Kalite doğrulaması (§6.3) çalıştır
```

---

## 9. Train / Val / Test Split

### Split Oranları

| Split | Oran | Amaç |
|-------|------|------|
| **Train** | %70 | Model eğitimi |
| **Val** | %20 | Eğitim sırasında validation (overfitting kontrolü) |
| **Test** | %10 | Eğitim sonrası bağımsız değerlendirme |

### Split Stratejisi

**Karıştırma kuralı:** Harici veri ve internal veri aynı split'lere **karıştırılır** (stratified shuffle). Gerekçe: model eğitimde hem lab ortamı hem gerçek sınıf ortamı görsün.

**İstisna:** Internal veri çok azsa (ilk sınavlar), ayrı tutulabilir:
- Harici: train/val split
- Internal: test split (gerçek ortam performans ölçümü)

**Stratified split:** Her split'te class dağılımı orijinal ile aynı olmalı. Scikit-learn `StratifiedShuffleSplit` veya basit per-class rastgele ayırma.

```python
# Split pseudo-code
for class_id in all_classes:
    class_images = get_images_for_class(class_id)
    random.shuffle(class_images)
    n = len(class_images)
    train = class_images[:int(0.7*n)]
    val   = class_images[int(0.7*n):int(0.9*n)]
    test  = class_images[int(0.9*n):]
```

**Veri sızıntısı kontrolü:** Aynı görselin farklı split'lerde olmaması garanti edilmeli. Merge sırasında duplicate kontrolü (§6.1) bunu önler.

---

## 10. Dataset Versiyonlama

Her birleştirilmiş dataset bir versiyon olarak kaydedilir:

```
Versiyon adlandırma: v{major}.{minor}
  - major artışı: yeni class eklendi veya class çıkarıldı
  - minor artışı: mevcut class'lara yeni veri eklendi

Örnekler:
  v1.0 — İlk dataset: earbuds (Roboflow) + phone (COCO)
  v1.1 — earbuds'a Open Images Headphones eklendi
  v2.0 — paper_notes class'ı eklendi
  v2.1 — internal sınıf ortamı verisi eklendi (50 sınavdan)
```

**dataset_meta.json:**
```json
{
  "version": "1.0",
  "created_at": "2026-06-01T10:00:00Z",
  "created_by": "admin-uuid",
  "sources": [
    {
      "name": "roboflow_earbuds_v1",
      "source_type": "roboflow",
      "source_url": "universe.roboflow.com/workspace/project/1",
      "license": "CC-BY-4.0",
      "original_count": 1247,
      "after_cleanup": 1199
    },
    {
      "name": "coco_phone_book",
      "source_type": "coco",
      "license": "CC-BY-4.0",
      "original_count": 1000,
      "after_cleanup": 987
    }
  ],
  "classes": ["earbuds", "phone", "book"],
  "statistics": {
    "total_images": 2186,
    "total_annotations": 4521,
    "split": { "train": 1530, "val": 437, "test": 219 },
    "per_class": {
      "earbuds": { "train": 840, "val": 240, "test": 119 },
      "phone": { "train": 420, "val": 120, "test": 60 },
      "book": { "train": 270, "val": 77, "test": 40 }
    }
  },
  "quality_report": "./quality_report.json",
  "parent_version": null,
  "trained_models": ["model-uuid-1"]
}
```

### Veritabanı

```sql
CREATE TABLE public.datasets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,                  -- "Earbuds + Phone v1"
  version         TEXT NOT NULL DEFAULT '1.0',
  source_type     TEXT NOT NULL
                  CHECK (source_type IN ('roboflow', 'open_images', 'kaggle', 'coco', 'internal', 'merged', 'custom')),
  source_url      TEXT,                           -- İndirme kaynağı URL
  license         TEXT,                           -- "CC-BY-4.0"
  target_classes  TEXT[] NOT NULL,                -- ARRAY['earbuds', 'phone', 'book']
  total_images    INTEGER DEFAULT 0,
  total_annotations INTEGER DEFAULT 0,
  split_counts    JSONB DEFAULT '{}',             -- {"train": 1530, "val": 437, "test": 219}
  class_counts    JSONB DEFAULT '{}',             -- {"earbuds": 1199, "phone": 600, "book": 387}
  quality_report  JSONB DEFAULT '{}',             -- validate_dataset.py çıktısı
  storage_path    TEXT NOT NULL,                  -- "data/merged/v1_earbuds_phone_book/"
  merged_from     UUID[] DEFAULT '{}',            -- Birleştirme kaynağı dataset ID'leri
  parent_id       UUID REFERENCES public.datasets(id), -- Önceki versiyon
  status          TEXT NOT NULL DEFAULT 'importing'
                  CHECK (status IN ('importing', 'validating', 'ready', 'merged', 'training', 'archived')),
  created_by      UUID REFERENCES public.user_profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_datasets_status ON public.datasets (status);
CREATE INDEX idx_datasets_source ON public.datasets (source_type);
```

**ai_models ↔ datasets ilişkisi:**
PRD-013 §14.4'teki `ai_models` tablosunda `dataset_id UUID REFERENCES public.datasets(id)` alanı mevcuttur. Bu FK ile hangi modelin hangi dataset ile eğitildiği takip edilir. Ek alan gerekmez.

---

## 11. Sınıf Ortamından Otomatik Veri Toplama

PRD-013 §14.5'in detaylı implementasyonu.

### 11.1 Proctor Aksiyon Etiketleme

| Proctor Aksiyonu | Etiket | Güvenilirlik | Klasör |
|-----------------|--------|-------------|--------|
| Incident'ı **dismiss** etti | Negatif (yanlış pozitif) | ★★★★ Yüksek | `internal/negatives/` |
| Incident'ı **flag** etti | Pozitif (doğru tespit) | ★★★★ Yüksek | `internal/positives/` |
| Post-exam `proctor_decision = 'violation'` | Kesin pozitif | ★★★★★ Çok yüksek | `internal/positives/` |
| Post-exam `proctor_decision = 'clean'` | Kesin negatif | ★★★★★ Çok yüksek | `internal/negatives/` |
| Incident oluştu, proctor tepki vermedi | Belirsiz | ★★ Düşük | `internal/unreviewed/` |

**⚠️ Unreviewed verinin kullanımı:** `unreviewed/` klasöründeki veriler **doğrudan eğitime sokulmamalıdır.** İki seçenek:
1. Manuel review: geliştirici veya admin gözden geçirir, doğru klasöre taşır
2. Yok say: sadece proctor onaylı veriyi kullan (önerilen ilk fazlarda)

### 11.2 Kontrollü Test Senaryoları (Bootstrap Sorunu Çözümü)

İlk sınavlarda model kötü → dismiss ağırlıklı (negatif sample fazla, pozitif az). Çözüm: bilinçli pozitif senaryolar oluştur.

**Kontrollü test prosedürü:**
```
Ortam: Gerçek sınıf, gerçek kameralar, gönüllü katılımcılar (ekip üyeleri)

Senaryo 1 — Telefon Kullanımı (phone):
  a) Telefonu masanın üstüne koy → 5 saniye tut → kaldır
  b) Telefonu kucağa koy, ekrana bak → 10 saniye
  c) Telefonu masanın altında tut, göz at → 5 saniye
  d) Telefonu cebinden çıkar, hızlıca bak, geri koy → 3 saniye
  Her senaryoyu 3 farklı kişi, 2 farklı koltuk, 2 farklı aydınlatma = 12 çekim

Senaryo 2 — Kulaklık (earbuds):
  a) Kulaklığı takılı şekilde otur → 10 saniye
  b) Kulaklığı saçla ört → 5 saniye
  c) Tek kulaklık → 5 saniye
  d) Kulaklık masanın üstünde → 5 saniye
  Her senaryoyu 3 kişi × 2 koltuk = 6 çekim

Senaryo 3 — Kağıt/Not (paper_notes):
  a) Küçük not kağıdını masaya koy → 5 saniye
  b) Kucağa not kağıdı → 5 saniye
  c) Cep'ten çıkarıp bak → 3 saniye
  3 kişi × 2 koltuk = 6 çekim

Senaryo 4 — Negatif Örnekler (meşru davranışlar):
  a) Normal sınav çözme (baş eğik, kalem kullanma)
  b) Düşünme (yukarı bakma, geriye yaslanma)
  c) Kalem düşürme, eğilme
  d) Saat kontrolü, gerginme
  Her senaryoyu 3 kişi = 12 çekim
```

**Toplam çıktı:** ~36 pozitif + 12 negatif kısa video clip → frame extraction ile **~200-400 annotated frame**.

**Frame extraction:**
```bash
# Kontrollü test videolarından frame çıkarma
python scripts/extract_test_frames.py \
  --video ./data/internal/controlled_tests/phone_scenario_1a.mp4 \
  --output ./data/internal/controlled_tests/frames/ \
  --fps 2 \
  --auto-detect  # YOLOv8 ile otomatik bbox önerisi üret, manuel doğrulama gerekir
```

**Annotation:** Çıkarılan frame'ler annotation tool ile etiketlenir:
- **Önerilen araç (ücretsiz):** Roboflow Annotate (web-based, ücretsiz 10K görsel/ay) veya CVAT (self-hosted, açık kaynak)
- **Alternatif:** LabelImg (desktop, hafif), Label Studio (self-hosted)
- **Hızlı yöntem:** YOLOv8 pre-trained ile `auto-detect` çalıştır → önerilen bbox'ları manuel düzelt (yarı otomatik, %70 daha hızlı)

### 11.3 Sınav Sonrası Otomatik Export

Her sınav sonunda otomatik çalışan export job:

```python
# scripts/export_training_data.py (PRD-013 §14.5'te referans verilir)

# Çalıştırma: sınav bittiğinde background job olarak

# Adım 1: Bu session'daki tüm incident'ları çek
incidents = supabase.from('incidents') \
    .select('*') \
    .eq('session_id', session_id) \
    .execute()

# Adım 2: Proctor aksiyonlarına göre sınıfla
for incident in incidents:
    frame_path = incident['evidence_paths'][0]  # İlk evidence frame

    if incident['proctor_decision'] == 'violation' or incident['is_flagged']:
        # Pozitif örnek
        copy_to('internal/positives/', frame_path, incident)
        generate_yolo_label(incident)  # bbox + class_id

    elif incident['proctor_decision'] == 'clean' or incident['is_dismissed']:
        # Negatif örnek (hard negative — model yanlış tespit etti)
        copy_to('internal/negatives/', frame_path, incident)
        generate_empty_label()  # Boş label dosyası (nesne yok)

    else:
        # Tepki verilmemiş — ayrı klasöre
        copy_to('internal/unreviewed/', frame_path, incident)

# Adım 3: İstatistik raporu
report = {
    'session_id': session_id,
    'exported_at': now(),
    'positives': count_positives,
    'negatives': count_negatives,
    'unreviewed': count_unreviewed,
    'cumulative_total': count_all_internal()
}
log_to_audit('ai.dataset_import', report)
```

**YOLO label oluşturma:**
```python
def generate_yolo_label(incident):
    """Incident'taki bbox bilgisinden YOLO format label üret."""
    # incident.raw_signals'tan bbox al
    # (PRD-013 §7.6'daki raw_signals JSONB'de saklanır)
    bbox = incident['raw_signals']['bbox']  # [x_center, y_center, w, h] normalized
    class_name = incident['incident_type']  # phone_detected, earbuds_detected, ...
    class_id = CLASS_MAP[class_name]

    label_line = f"{class_id} {bbox[0]} {bbox[1]} {bbox[2]} {bbox[3]}"
    write_label_file(label_line)
```

---

## 12. End-to-End Eğitim Pipeline'ı

Tüm adımları birleştiren tam pipeline:

```
Phase A.1 İlk Fine-Tune (minimum viable):
═══════════════════════════════════════════

1. HAZIRLIK (1 gün)
   ├── Kontrollü test ortamı kur (§11.2)
   ├── Test senaryolarını çek (~36 video clip)
   ├── Frame extraction → ~200-400 frame
   └── Annotation (Roboflow Annotate veya CVAT)

2. HARİCİ VERİ (yarım gün)
   ├── Roboflow'dan earbuds dataset indir (§4.1A)
   ├── COCO'dan phone+book subset çek (§4.1D)
   ├── Format dönüşüm (§5.2)
   └── Kalite doğrulama (§6)

3. BİRLEŞTİRME (1 saat)
   ├── Class mapping uygula (§8.1)
   ├── Merge (§8.3)
   ├── Split (§9)
   └── Dataset versiyonu kaydet (§10)

4. EĞİTİM (Colab/Kaggle — 15-30 dk)
   ├── Dataset'i Colab'a yükle
   ├── YOLOv8 fine-tune:
   │   yolo train data=data.yaml model=yolov8n.pt \
   │     epochs=50 imgsz=640 batch=16 \
   │     project=horuseye name=v1_earbuds_phone
   └── Weights indir: best.pt

5. DEĞERLENDİRME (§13)
   ├── Test split üzerinde precision/recall hesapla
   ├── Kabul kriterleri kontrol et
   └── Başarısız → threshold ayarla veya veri artır → adım 2'ye dön

6. DEPLOY (PRD-013 §14.4)
   ├── Model'i ai-service/models/ altına kopyala
   ├── POST /api/ai/models/[id]/test → mock video test
   └── POST /api/ai/models/[id]/deploy → aktif yap
```

```
Phase B+ Sürekli İyileştirme:
═════════════════════════════

Her sınav sonrası:
  1. Otomatik export (§11.3) → internal veri büyür
  2. 50+ sınav sonrası: internal veri yeterli → yeni fine-tune
  3. Harici + internal veri merge → yeni versiyon
  4. A/B testing (PRD-013 §14.5) → daha iyi ise promote
  5. Döngü tekrarlanır
```

---

## 13. Model Değerlendirme & Kabul Kriterleri

### Test Split Metrikleri

Her eğitim sonrası test split üzerinde hesaplanan metrikler:

| Metrik | Formül | Açıklama |
|--------|--------|----------|
| **Precision** | TP / (TP + FP) | Tespit edilenlerin kaçı gerçekten doğru |
| **Recall** | TP / (TP + FN) | Gerçek nesnelerin kaçı tespit edildi |
| **F1 Score** | 2 × (P × R) / (P + R) | Precision ve recall dengesi |
| **mAP@0.5** | Ortalama AP (IoU ≥ 0.5) | YOLO standardı |
| **mAP@0.5:0.95** | Ortalama AP (IoU 0.5-0.95) | Daha sıkı değerlendirme |

### Kabul Kriterleri (Phase'e Göre)

| Metrik | Phase A.1 (Minimum) | Phase B (Hedef) | Phase C (Olgun) |
|--------|--------------------|-----------------|-----------------|
| **phone precision** | ≥ %75 | ≥ %85 | ≥ %90 |
| **phone recall** | ≥ %70 | ≥ %80 | ≥ %85 |
| **earbuds precision** | — | ≥ %70 | ≥ %80 |
| **earbuds recall** | — | ≥ %65 | ≥ %75 |
| **book precision** | ≥ %70 | ≥ %80 | ≥ %85 |
| **person recall** | ≥ %95 | ≥ %95 | ≥ %98 |
| **mAP@0.5 (toplam)** | ≥ 0.65 | ≥ 0.75 | ≥ 0.85 |
| **FP oranı (genel)** | < %25 | < %15 | < %10 |

**Kriterler karşılanmıyorsa:**
1. Confidence threshold'u ayarla (düşür → recall artar ama FP artar, artır → tersi)
2. Daha fazla veri topla (özellikle başarısız class için)
3. Augmentation ayarlarını değiştir (§7)
4. Epoch sayısını artır (overfitting'e dikkat)
5. Model boyutunu artır: yolov8n → yolov8s (daha yavaş ama daha doğru)

### Benchmark Prosedürü (PRD-013 §14.3 referans)

Fine-tune sonrası, eğitim verisinden **bağımsız** gerçek sınıf ortamında benchmark zorunludur:

```
1. Sınıfta 3 farklı aydınlatma koşulunda 50'şer frame kaydet = 150 frame
2. Her frame'de manuel etiketle
3. Fine-tune model inference çalıştır
4. Precision/recall hesapla
5. Kabul kriterlerini kontrol et
6. Sonuçları ai_models.metrics JSONB'ye kaydet
```

---

## 14. Sürekli İyileştirme Döngüsü

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ Sınav    │───►│ Otomatik │───►│ Internal │              │
│  │ Yapılır  │    │ Export   │    │ Veri     │              │
│  └──────────┘    │ (§11.3)  │    │ Büyür    │              │
│                  └──────────┘    └────┬─────┘              │
│                                      │                      │
│                                      ▼                      │
│                               ┌──────────────┐             │
│                               │ Yeterli veri │             │
│                               │ birikti mi?  │             │
│                               └──────┬───────┘             │
│                                      │                      │
│                          Hayır ◄─────┼─────► Evet          │
│                          (bekle)     │     (eğit)          │
│                                      ▼                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ Deploy   │◄───│ A/B Test │◄───│ Fine-    │              │
│  │ (v2)     │    │ (%10)    │    │ Tune     │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│       │                                                     │
│       └─────────────────────────────────────────────────────┘
│                         (döngü)
└─────────────────────────────────────────────────────────────┘
```

**Yeterli veri eşikleri:**
| Class | İlk Fine-Tune (A.1) | İterativ (B+) |
|-------|--------------------|--------------|
| Yeni class (hiç veri yoktu) | 200 positive + 200 negative | +100 positive per iterasyon |
| Mevcut class (iyileştirme) | — | +50 positive per iterasyon |

**Eğitim tetikleyicileri:**
- Manuel: admin `/ai/training` sayfasından başlatır
- Önerilen: her 10 sınav sonrası (veya her 500 yeni annotated frame) admin'e bildirim: "Yeni eğitim verisi mevcut. Model güncellemek ister misiniz?"

---

## 15. API Routes

```
-- Dataset Yönetimi (Admin)
GET    /api/ai/datasets                → Dataset listesi (?status, ?source_type filter)
POST   /api/ai/datasets/import         → Harici dataset import (metadata + dosya yolu)
GET    /api/ai/datasets/[id]           → Dataset detay + istatistikler
DELETE /api/ai/datasets/[id]           → Dataset sil (arşivle)
POST   /api/ai/datasets/[id]/validate  → Kalite doğrulama çalıştır
POST   /api/ai/datasets/merge          → Birden fazla dataset birleştir
GET    /api/ai/datasets/[id]/export    → YOLO format ZIP olarak indir
```

---

## 16. Ortam Değişkenleri

```env
# Harici Veri Kaynakları (opsiyonel)
ROBOFLOW_API_KEY=              # Roboflow Universe API erişimi (CLI ile indirme için)
                                # Web üzerinden indirme yapılıyorsa gereksiz
```

**Not:** Kaggle API token (`~/.kaggle/kaggle.json`) dosya bazlı — env var değil.
Open Images indirmesi API key gerektirmez (public dataset).

---

## 17. Klasör Yapısı

```
ai-service/
├── data/                              # ← Bu PRD'nin ana klasörü
│   ├── raw/                           # Ham indirilen veriler
│   ├── converted/                     # YOLO formatına dönüştürülmüş
│   ├── merged/                        # Birleştirilmiş final dataset'ler
│   ├── internal/                      # Sınıf ortamından toplanan veri
│   │   ├── positives/
│   │   ├── negatives/
│   │   ├── unreviewed/
│   │   └── controlled_tests/
│   └── exports/                       # Fine-tuning için paketlenmiş
│
├── scripts/                           # ← Dataset pipeline script'leri
│   ├── import_dataset.py              # Harici dataset indirme
│   ├── convert_dataset.py             # Format dönüşüm
│   ├── validate_dataset.py            # Kalite doğrulama
│   ├── merge_datasets.py              # Dataset birleştirme
│   ├── augment_dataset.py             # Ek augmentation (opsiyonel)
│   ├── extract_test_frames.py         # Kontrollü test video → frame
│   └── export_training_data.py        # Sınav sonrası otomatik export
│
├── configs/                           # ← Konfigürasyon dosyaları
│   ├── class_mapping.yaml             # Kaynak → hedef class eşleştirme
│   └── augmentation.yaml              # Augmentation parametreleri
│
├── models/                            # Eğitilmiş model weights (PRD-013)
└── ...
```

---

## 18. Eğitim Verisi Gizliliği & KVKK

PRD-013 §24 genel privacy politikasını tanımlar. Bu bölüm **eğitim verisine özgü** gizlilik kurallarını belirler.

### 18.1 Temel Sorun

PRD-013 §21.1 evidence frame'lerini 90 günde siler. PRD-013 §24.2 veri minimizasyonu ilkesi tanımlar. Ancak eğitim verisine kopyalanan frame'ler kalıcılaşır — bu çelişkiyi çözmek gerekir.

### 18.2 Eğitim Verisi Retention Politikası

| Veri Tipi | Retention | Gerekçe |
|-----------|-----------|---------|
| **Harici dataset** (Roboflow, OID, COCO) | Süresiz | Üçüncü taraf verileri, öğrenci görseli içermez |
| **Kontrollü test görselleri** (§11.2) | Süresiz | Gönüllü katılımcılar, yazılı rıza alınmış |
| **Internal positives/negatives** (gerçek sınav) | **Anonimize edildikten sonra** süresiz | Öğrenci yüzleri eğitim sırasında gerekli değil — nesne tespiti bbox odaklı |
| **Internal unreviewed** | 90 gün (evidence ile aynı) | Etiketlenmemiş, eğitimde kullanılmıyor |

### 18.3 Anonimizasyon Pipeline'ı

Gerçek sınav frame'leri eğitim verisine kopyalanmadan önce anonimize edilir:

```
Orijinal evidence frame (incident anı)
    ↓
[Yüz Anonimizasyon]
    → YOLOv8 person detection ile tüm yüzleri tespit et
    → Eğitim hedefi YÜZLE İLGİLİ DEĞİLSE (phone, earbuds, book, paper):
        → Tüm yüzleri Gaussian blur uygula (kernel 31×31)
    → Eğitim hedefi YÜZLE İLGİLİYSE (gaze, head — ileride):
        → Bu frame eğitim verisine KOPYALANMAZ
        → Sadece MediaPipe landmark koordinatları (sayısal veri) saklanır
    ↓
Anonimize frame → internal/positives/ veya internal/negatives/
```

**Neden bbox eğitimi için yüz gerekli değil?**
YOLOv8 telefon/kulaklık/kitap tespiti öğreniyor — nesnenin etrafındaki bbox. Öğrencinin yüzü bu tespitte bilgi taşımaz. Yüz bulanıklaştırma model performansını etkilemez.

```python
# ai-service/scripts/anonymize_frame.py

import cv2
import numpy as np

def anonymize_faces(frame, face_bboxes):
    """Tespit edilen yüzleri Gaussian blur ile anonimize et."""
    result = frame.copy()
    for (x, y, w, h) in face_bboxes:
        face_region = result[y:y+h, x:x+w]
        blurred = cv2.GaussianBlur(face_region, (31, 31), 30)
        result[y:y+h, x:x+w] = blurred
    return result
```

### 18.4 Rıza Gereksinimleri

| Veri Kaynağı | Rıza Gerekli mi? | Açıklama |
|-------------|-----------------|----------|
| **Harici dataset** | Hayır | Üçüncü taraf, lisans kapsamında |
| **Kontrollü test** (§11.2) | **Evet — yazılı** | Gönüllü katılımcılar test öncesi rıza formu imzalar |
| **Gerçek sınav — anonimize** | Hayır (anonimize sonrası) | Yüzler bulanık, kişi tanımlanamaz → kişisel veri kapsamı dışı |
| **Gerçek sınav — anonimize edilmemiş** | **Kullanılmaz** | Ham frame doğrudan eğitim verisine kopyalanmaz |

**Kontrollü test rıza formu içeriği:**
- "Bu testte kamera görüntünüz kaydedilecektir"
- "Görüntüler AI model eğitimi için kullanılacaktır"
- "Veriler proje süresince saklanacak, proje sonrası silinecektir"
- "İstediğiniz zaman verinizin silinmesini talep edebilirsiniz"

### 18.5 Export Pipeline'ına Anonimizasyon Entegrasyonu

PRD-017 §11.3'teki `export_training_data.py` script'ine ek adım:

```
Mevcut akış:
  incident → evidence frame → sınıfla (positive/negative) → klasöre kopyala

Güncellenen akış:
  incident → evidence frame → sınıfla (positive/negative)
    → anonymize_faces() uygula                              ← YENİ
    → anonimize frame'i klasöre kopyala
    → orijinal frame KOPYALANMAZ (evidence olarak kalır, 90 günde silinir)
```

### 18.6 Silme Hakkı

Öğrenci talep ederse:
1. O öğrencinin incident'larından üretilen eğitim frame'leri zaten anonimize — kişi tanımlanamaz
2. Yine de talep üzerine: `incidents` tablosundan `student_id` ile eşleşen eğitim frame'leri silinir
3. Silme işlemi `audit_logs`'a kaydedilir
4. **Eğitilmiş model etkilenmez** — model weights'te bireysel görsel reconstruct edilemez

---

## 19. Implementation Fazları

| Faz | Kapsam | Gerekli Veri | Açıklama |
|-----|--------|-------------|----------|
| **A** | COCO pre-trained | Yok | Bu PRD aktif değil. PRD-013 §14.1 yeterli |
| **A.1** | İlk custom fine-tune | Kontrollü test (§11.2) + Roboflow earbuds + COCO phone/book | Pipeline'ın ilk çalışması. §12'deki adımlar izlenir. Anonimizasyon henüz gerekmez (kontrollü test = gönüllü rıza) |
| **B** | Tam custom training | Harici + internal (50+ sınav) | Tüm kaynaklar birleştirilir. Sürekli döngü (§14) başlar. **Anonimizasyon pipeline'ı (§18.3) zorunlu** — gerçek sınav verisi kullanılıyor |
| **C+** | Sürekli iyileştirme | Internal ağırlıklı (100+ sınav) | Harici veri azalır, internal veri baskınlaşır |

---

## Changelog

| Versiyon | Tarih | Değişiklik |
|----------|-------|-----------|
| 1.0 | 2026-03-21 | İlk tanım — harici veri kaynakları, pipeline spesifikasyonu, kalite standartları, augmentation, birleştirme, versiyonlama |
| 1.1 | 2026-03-21 | §18 eklendi — eğitim verisi KVKK/gizlilik politikası, anonimizasyon pipeline'ı, retention kuralları, rıza gereksinimleri. `ai_models.dataset_info` → `dataset_id` FK düzeltmesi |
