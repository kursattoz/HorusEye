#!/usr/bin/env python3
"""HorusEye — Dönem Sonu Poster Sunum Rehberi (A4, light mode).

Bu PDF; posterin kendisi değil, posteri tasarlayacak ekip için
bir REHBER dokümandır. A4 baskıya uygun, light mode tasarımdadır.
"""

import os

from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

# ── Türkçe uyumlu fontlar ──
ARIAL = "/System/Library/Fonts/Supplemental/Arial.ttf"
ARIAL_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
ARIAL_ITALIC = "/System/Library/Fonts/Supplemental/Arial Italic.ttf"
ARIAL_BI = "/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf"
MONO = "/System/Library/Fonts/Supplemental/Courier New.ttf"
MONO_BOLD = "/System/Library/Fonts/Supplemental/Courier New Bold.ttf"

pdfmetrics.registerFont(TTFont("ArialTR", ARIAL))
pdfmetrics.registerFont(TTFont("ArialTR-Bold", ARIAL_BOLD))
pdfmetrics.registerFont(TTFont("ArialTR-Italic", ARIAL_ITALIC))
pdfmetrics.registerFont(TTFont("ArialTR-BoldItalic", ARIAL_BI))
pdfmetrics.registerFont(TTFont("MonoTR", MONO))
pdfmetrics.registerFont(TTFont("MonoTR-Bold", MONO_BOLD))
registerFontFamily(
    "ArialTR",
    normal="ArialTR",
    bold="ArialTR-Bold",
    italic="ArialTR-Italic",
    boldItalic="ArialTR-BoldItalic",
)

# ── Light mode palet (HorusEye marka — kırmızı) ──
PRIMARY = HexColor("#c0392b")          # HorusEye red (favicon)
PRIMARY_DARK = HexColor("#8c2a1f")
PRIMARY_BG = HexColor("#fdf2f0")
ACCENT = HexColor("#f59e0b")
ACCENT_BG = HexColor("#fffbeb")
SUCCESS = HexColor("#16a34a")
SUCCESS_BG = HexColor("#ecfdf5")
INFO = HexColor("#0ea5e9")
INFO_BG = HexColor("#eff6ff")
TEXT = HexColor("#0f172a")
TEXT_MUTED = HexColor("#475569")
TEXT_LIGHT = HexColor("#64748b")
BORDER = HexColor("#e2e8f0")
LIGHT_BG = HexColor("#f8fafc")
CARD_BG = HexColor("#ffffff")

W, H = A4
MARGIN = 1.7 * cm


# ── Özel Flowable'lar ─────────────────────────────────────────────


class CoverHero(Flowable):
    """Kapak başlığı — HorusEye logo glifi + isim + altyazı."""

    def wrap(self, aw, ah):
        self.w = aw
        return (aw, 220)

    def draw(self):
        c = self.canv
        # Arka plan kart
        c.setFillColor(PRIMARY_BG)
        c.roundRect(0, 0, self.w, 220, 18, fill=1, stroke=0)

        # HorusEye stilize "göz" glifi — basit oval
        cx, cy = self.w / 2, 152
        c.setFillColor(PRIMARY)
        # dış elipsoid
        c.ellipse(cx - 56, cy - 18, cx + 56, cy + 18, fill=1, stroke=0)
        # iris (beyaz)
        c.setFillColor(white)
        c.circle(cx, cy, 14, fill=1, stroke=0)
        # göz bebeği
        c.setFillColor(PRIMARY_DARK)
        c.circle(cx, cy, 6, fill=1, stroke=0)

        # Wordmark
        c.setFillColor(PRIMARY)
        c.setFont("ArialTR-Bold", 30)
        c.drawCentredString(cx - 18, 92, "horus")
        c.setFillColor(TEXT_LIGHT)
        c.setFont("ArialTR", 30)
        c.drawString(cx + 28, 92, "eye")

        # Tag
        c.setFillColor(TEXT_MUTED)
        c.setFont("ArialTR", 11)
        c.drawCentredString(
            cx, 66, "Yapay Zekâ Destekli Sınav Gözetim Sistemi"
        )

        # İnce ayraç
        c.setStrokeColor(PRIMARY)
        c.setLineWidth(1.2)
        c.line(cx - 60, 50, cx + 60, 50)

        # Doküman amacı
        c.setFillColor(PRIMARY)
        c.setFont("ArialTR-Bold", 14)
        c.drawCentredString(cx, 26, "Dönem Sonu Poster Sunum Rehberi")


class SectionHeader(Flowable):
    """Numaralı, kırmızı vurgu çizgili bölüm başlığı."""

    def __init__(self, num, title, subtitle=None):
        super().__init__()
        self.num = str(num).zfill(2)
        self.title = title
        self.subtitle = subtitle
        self.keepWithNext = True

    def wrap(self, aw, ah):
        self.w = aw
        return (aw, 50 if self.subtitle else 40)

    def draw(self):
        c = self.canv
        h = 50 if self.subtitle else 40
        # Sol numara rozeti
        c.setFillColor(PRIMARY)
        c.roundRect(0, h - 32, 30, 30, 6, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("ArialTR-Bold", 12)
        c.drawCentredString(15, h - 22, self.num)
        # Başlık
        c.setFillColor(PRIMARY)
        c.setFont("ArialTR-Bold", 17)
        c.drawString(40, h - 22, self.title)
        if self.subtitle:
            c.setFillColor(TEXT_LIGHT)
            c.setFont("ArialTR-Italic", 9.5)
            c.drawString(40, h - 38, self.subtitle)
        # Alt çizgi
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.8)
        c.line(0, 0, self.w, 0)


class Callout(Flowable):
    """Renkli sol şerit + arka plan kart."""

    def __init__(self, title, body, kind="info"):
        super().__init__()
        self.title = title
        self.body = body
        self.kind = kind

    def wrap(self, aw, ah):
        self.w = aw
        bg, stripe = self._colors()
        style = ParagraphStyle(
            "cb",
            fontName="ArialTR",
            fontSize=9.5,
            leading=13.5,
            textColor=TEXT,
        )
        p = Paragraph(self.body, style)
        pw, ph = p.wrap(self.w - 36, ah)
        self.para = p
        self.para_h = ph
        title_h = 18 if self.title else 0
        self.total_h = ph + title_h + 18
        return (aw, self.total_h)

    def _colors(self):
        return {
            "info": (INFO_BG, INFO),
            "success": (SUCCESS_BG, SUCCESS),
            "warning": (ACCENT_BG, ACCENT),
            "danger": (PRIMARY_BG, PRIMARY),
        }[self.kind]

    def draw(self):
        c = self.canv
        bg, stripe = self._colors()
        c.setFillColor(bg)
        c.roundRect(0, 0, self.w, self.total_h, 6, fill=1, stroke=0)
        c.setFillColor(stripe)
        c.rect(0, 0, 4, self.total_h, fill=1, stroke=0)
        title_h = 18 if self.title else 0
        if self.title:
            c.setFillColor(stripe)
            c.setFont("ArialTR-Bold", 10.5)
            c.drawString(18, self.total_h - 14, self.title)
        self.para.drawOn(c, 18, 8)


class StatTiles(Flowable):
    """4'lü sayı kartı şeridi."""

    def __init__(self, tiles):
        super().__init__()
        self.tiles = tiles  # [(number, label), ...]

    def wrap(self, aw, ah):
        self.w = aw
        return (aw, 78)

    def draw(self):
        c = self.canv
        n = len(self.tiles)
        gap = 10
        tw = (self.w - gap * (n - 1)) / n
        x = 0
        for big, label in self.tiles:
            c.setFillColor(CARD_BG)
            c.setStrokeColor(BORDER)
            c.setLineWidth(0.8)
            c.roundRect(x, 0, tw, 78, 8, fill=1, stroke=1)
            c.setFillColor(PRIMARY)
            c.setFont("ArialTR-Bold", 24)
            c.drawCentredString(x + tw / 2, 38, big)
            c.setFillColor(TEXT_MUTED)
            c.setFont("ArialTR", 8.5)
            # Label kırılabilir — iki satır maksimum
            words = label.split(" ")
            if len(label) > 22 and len(words) > 1:
                mid = len(words) // 2
                line1 = " ".join(words[:mid])
                line2 = " ".join(words[mid:])
                c.drawCentredString(x + tw / 2, 22, line1)
                c.drawCentredString(x + tw / 2, 10, line2)
            else:
                c.drawCentredString(x + tw / 2, 16, label)
            x += tw + gap


class PosterLayoutMockup(Flowable):
    """A0 posterin kuş bakışı düzen önerisi (mockup)."""

    def wrap(self, aw, ah):
        self.w = aw
        # 1:√2 oranı (poster portre) — eninin ~1.41 katı
        self.h = aw * 1.05
        return (aw, self.h)

    def draw(self):
        c = self.canv
        w, h = self.w, self.h

        # Dış çerçeve (poster)
        c.setFillColor(CARD_BG)
        c.setStrokeColor(TEXT_LIGHT)
        c.setLineWidth(1.0)
        c.roundRect(0, 0, w, h, 6, fill=1, stroke=1)

        pad = 8

        def block(x, y, bw, bh, color, label, sub=None, label_size=8.5):
            c.setFillColor(color)
            c.roundRect(x, y, bw, bh, 4, fill=1, stroke=0)
            c.setFillColor(TEXT)
            c.setFont("ArialTR-Bold", label_size)
            c.drawCentredString(x + bw / 2, y + bh / 2 + 2, label)
            if sub:
                c.setFillColor(TEXT_LIGHT)
                c.setFont("ArialTR", 7)
                c.drawCentredString(x + bw / 2, y + bh / 2 - 8, sub)

        # 1. Başlık şeridi
        title_h = 64
        block(pad, h - pad - title_h, w - 2 * pad, title_h,
              PRIMARY_BG, "1 · BAŞLIK ŞERİDİ",
              "Logo · Proje adı · Üniversite · CMPE 491/492 · 2026", 10)

        # 2-4. Üç sütun (sol/orta/sağ)
        col_y_top = h - pad - title_h - 6
        col_h = h - title_h - 180  # alt için pay
        col_w = (w - 2 * pad - 12) / 3

        def column(x, y, bw, bh, color, title, lines):
            c.setFillColor(color)
            c.roundRect(x, y, bw, bh, 4, fill=1, stroke=0)
            c.setFillColor(TEXT)
            c.setFont("ArialTR-Bold", 10)
            c.drawCentredString(x + bw / 2, y + bh / 2 + 18, title)
            c.setFillColor(TEXT_LIGHT)
            c.setFont("ArialTR", 7.5)
            ly = y + bh / 2 + 2
            for line in lines:
                c.drawCentredString(x + bw / 2, ly, line)
                ly -= 11

        column(pad, col_y_top - col_h, col_w, col_h, INFO_BG,
               "2 · SOL SÜTUN",
               ["Problem", "Motivasyon", "Özellikler"])
        column(pad + col_w + 6, col_y_top - col_h, col_w, col_h, LIGHT_BG,
               "3 · ORTA SÜTUN (Geniş)",
               ["Sistem mimarisi", "Sprint timeline", "17 davranış tipi"])
        column(pad + 2 * (col_w + 6), col_y_top - col_h, col_w, col_h,
               SUCCESS_BG, "4 · SAĞ SÜTUN",
               ["AI pipeline", "Demo görselleri", "Sayısal sonuçlar"])

        # 5. Etik / KVKK uyarı bandı
        eth_y = col_y_top - col_h - 6 - 50
        block(pad, eth_y, w - 2 * pad, 50,
              ACCENT_BG, "5 · ETİK & KVKK UYARI KUTUSU",
              "“Sistem otomatik karar VERMEZ — tüm tespitler insan incelemesi içindir.”", 9)

        # 6. Ekip + supervisor
        team_y = eth_y - 6 - 48
        block(pad, team_y, w - 2 * pad - 90, 48,
              PRIMARY_BG, "6 · EKİP ŞERİDİ",
              "5 üye · dev_role · Süpervizör: Fırat Akba", 9)
        # 7. QR kart
        block(w - pad - 86, team_y, 86, 48,
              CARD_BG, "7 · QR",
              "horuseye.app", 8.5)
        # QR kareleri stilizesi
        c.setStrokeColor(TEXT)
        c.setLineWidth(1)
        c.rect(w - pad - 76, team_y + 6, 36, 36, fill=0, stroke=1)

        # Lejand
        legend = [
            ("Birincil renk (HorusEye kırmızısı)", PRIMARY),
            ("Bilgi / mavi", INFO),
            ("Başarı / yeşil", SUCCESS),
            ("Uyarı / amber", ACCENT),
        ]
        ly = 8
        c.setFont("ArialTR", 7)
        c.setFillColor(TEXT_LIGHT)
        c.drawString(pad, ly, "Lejand:")
        lx = pad + 36
        for lbl, col in legend:
            c.setFillColor(col)
            c.rect(lx, ly - 1, 7, 7, fill=1, stroke=0)
            c.setFillColor(TEXT_LIGHT)
            c.drawString(lx + 10, ly, lbl)
            lx += 110


class ColorSwatches(Flowable):
    """Renk paleti şeridi — büyük kare + hex altta."""

    def __init__(self, swatches):
        super().__init__()
        self.swatches = swatches  # [(name, hex, role)]

    def wrap(self, aw, ah):
        self.w = aw
        return (aw, 92)

    def draw(self):
        c = self.canv
        n = len(self.swatches)
        gap = 8
        sw = (self.w - gap * (n - 1)) / n
        x = 0
        for name, hex_code, role in self.swatches:
            col = HexColor(hex_code)
            c.setFillColor(col)
            c.setStrokeColor(BORDER)
            c.roundRect(x, 40, sw, 50, 6, fill=1, stroke=1)
            c.setFillColor(TEXT)
            c.setFont("ArialTR-Bold", 9)
            c.drawString(x, 30, name)
            c.setFillColor(TEXT_LIGHT)
            c.setFont("MonoTR", 7.5)
            c.drawString(x, 19, hex_code)
            c.setFillColor(PRIMARY)
            c.setFont("ArialTR-Italic", 7.5)
            c.drawString(x, 8, role)
            x += sw + gap


# ── Sayfa numarası ──
def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 1.5 * cm, W - MARGIN, 1.5 * cm)
    canvas.setFont("ArialTR", 8)
    canvas.setFillColor(TEXT_LIGHT)
    canvas.drawString(MARGIN, 1.0 * cm, "HorusEye · Dönem Sonu Poster Rehberi")
    canvas.drawRightString(W - MARGIN, 1.0 * cm, f"Sayfa {doc.page}")
    canvas.restoreState()


# ── Stiller ──
def get_styles():
    s = {}
    s["Body"] = ParagraphStyle(
        "Body", fontName="ArialTR", fontSize=10, leading=14.5,
        textColor=TEXT, spaceAfter=6, alignment=TA_JUSTIFY)
    s["BodyTight"] = ParagraphStyle(
        "BodyTight", fontName="ArialTR", fontSize=9.5, leading=13.5,
        textColor=TEXT, spaceAfter=3, alignment=TA_JUSTIFY)
    s["BodyMuted"] = ParagraphStyle(
        "BodyMuted", fontName="ArialTR", fontSize=9, leading=12.5,
        textColor=TEXT_LIGHT, spaceAfter=4)
    s["Bullet"] = ParagraphStyle(
        "Bullet", fontName="ArialTR", fontSize=9.5, leading=13.5,
        textColor=TEXT, leftIndent=14, bulletIndent=2, spaceAfter=2)
    s["H3"] = ParagraphStyle(
        "H3", fontName="ArialTR-Bold", fontSize=12, leading=15,
        textColor=PRIMARY_DARK, spaceBefore=10, spaceAfter=4,
        keepWithNext=True)
    s["H4"] = ParagraphStyle(
        "H4", fontName="ArialTR-Bold", fontSize=10.5, leading=14,
        textColor=TEXT, spaceBefore=6, spaceAfter=2,
        keepWithNext=True)
    s["CoverMeta"] = ParagraphStyle(
        "CoverMeta", fontName="ArialTR", fontSize=11, leading=16,
        textColor=TEXT_MUTED, alignment=TA_CENTER, spaceAfter=8)
    s["CoverLabel"] = ParagraphStyle(
        "CoverLabel", fontName="ArialTR-Bold", fontSize=9, leading=12,
        textColor=PRIMARY, alignment=TA_CENTER, spaceAfter=2)
    s["Caption"] = ParagraphStyle(
        "Caption", fontName="ArialTR-Italic", fontSize=8.5, leading=11,
        textColor=TEXT_LIGHT, alignment=TA_CENTER, spaceAfter=6)
    s["Pull"] = ParagraphStyle(
        "Pull", fontName="ArialTR-Bold", fontSize=13, leading=18,
        textColor=PRIMARY, spaceAfter=8, alignment=TA_LEFT)
    return s


def bullet_list(items, sty):
    flows = []
    for it in items:
        flows.append(Paragraph(f"•&nbsp;&nbsp;{it}", sty))
    return flows


# ── İçerik ──
def build_story():
    styles = get_styles()
    story = []

    # ════════════════════════════════════════════════════════════
    # SAYFA 1 — KAPAK
    # ════════════════════════════════════════════════════════════
    story.append(Spacer(1, 10))
    story.append(CoverHero())
    story.append(Spacer(1, 24))

    story.append(Paragraph(
        "Bu doküman; HorusEye projesinin dönem sonu poster sunumu için "
        "<b>içerik önerilerini, görsel düzen şablonunu ve baskı kontrol "
        "listesini</b> tek bir referansta toplar. Doğrudan posterin kendisi "
        "değildir — posteri tasarlayacak ekibin elinde A4 baskı olarak "
        "kullanması içindir.",
        styles["Body"]))
    story.append(Spacer(1, 14))

    # Proje meta kartı
    meta_data = [
        ["Proje", "HorusEye — Yapay Zekâ Destekli Sınav Gözetim Sistemi"],
        ["Kurum", "TED Üniversitesi · Bilgisayar Mühendisliği"],
        ["Ders", "CMPE 491 / CMPE 492 — Senior Project I & II"],
        ["Ekip", "Çağla Abazaoğlu · Gizem Nur İpek · Taha Kürşat Öztürk · "
                 "Ali Sahil · Tuğba Hilal Kırer"],
        ["Süpervizör", "Fırat Akba"],
        ["Doküman tarihi", "14 Mayıs 2026"],
        ["Repo dalı", "chore/roboflow-workspace-env (Phase 2, Sprint 14–18 kapanmış)"],
    ]
    tbl = Table(meta_data, colWidths=[3.2 * cm, 12.5 * cm])
    tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (0, -1), "ArialTR-Bold", 9.5),
        ("FONT", (1, 0), (1, -1), "ArialTR", 9.5),
        ("TEXTCOLOR", (0, 0), (0, -1), PRIMARY_DARK),
        ("TEXTCOLOR", (1, 0), (1, -1), TEXT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, BORDER),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 16))

    story.append(Paragraph(
        "<b>Posterin amacı:</b> ziyaretçi posterin önünden geçerken 5 "
        "saniyede ne yaptığımızı, 30 saniyede neden önemli olduğunu ve 2 "
        "dakikada nasıl çalıştığını anlayabilmeli. Bu PDF tam olarak bu "
        "üç katmanı kurgular.",
        styles["Body"]))

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════
    # SAYFA 2 — PROJE ÖZETİ + ANAHTAR SAYILAR
    # ════════════════════════════════════════════════════════════
    story.append(SectionHeader(1, "Projeyi 60 Saniyede Anlatmak",
                               "Postere koyacağın özet metnin ham hâli"))
    story.append(Spacer(1, 8))

    story.append(Paragraph(
        "<b>Problem.</b> Yüz yüze sınavlarda gözetmen başına düşen öğrenci "
        "sayısı arttıkça dikkat darboğazı oluşur; kopya girişimleri kısa "
        "ve yerel olduğu için kolayca gözden kaçar. Manuel gözetim ölçek"
        "lenmez, video kayıt sonrası analizi ise pratik değildir.",
        styles["Body"]))

    story.append(Paragraph(
        "<b>Çözüm.</b> HorusEye, sınav salonundaki kameralardan gelen "
        "görüntüyü gerçek zamanlı analiz eden bir <b>asistan</b> sistemdir. "
        "Otomatik karar vermez — şüpheli davranışları skorlayıp gözetmenin "
        "önüne <b>kanıtla birlikte</b> getirir. Sınav sonrası gözetmen her "
        "olayı <i>clean / suspicious / violation</i> olarak işaretler.",
        styles["Body"]))

    story.append(Paragraph(
        "<b>Farkımız.</b> Sadece nesne tespiti değil; çoklu sinyali "
        "(bakış · poz · nesne · komşu etkileşimi) zamana yayılmış pencerede "
        "birleştirir. Çoklu kamera, telefon-as-camera, kalibrasyon ve "
        "yüz tanımlı öğrenci eşleme ile salonun tamamını tek panelde "
        "yönetir.",
        styles["Body"]))

    story.append(Spacer(1, 6))
    story.append(Paragraph("Postere koymak için anahtar rakamlar:",
                           styles["H4"]))
    story.append(StatTiles([
        ("22", "PRD dokümanı"),
        ("18", "iki-haftalık sprint"),
        ("17", "tespit edilen davranış tipi"),
        ("53", "veritabanı migration’ı"),
    ]))
    story.append(Spacer(1, 8))
    story.append(StatTiles([
        ("5+1", "ekip + süpervizör"),
        ("3", "AWS ortamı (local/staging/prod)"),
        ("~$60", "aylık bulut maliyeti (sınav saatleri)"),
        ("CPU", "GPU gerektirmez — ECS Fargate"),
    ]))
    story.append(Spacer(1, 10))

    story.append(Callout(
        "Sahnenin sloganı (poster header altına önerilir)",
        "<b>“AI sees. The proctor decides.”</b> — Sistem otomatik karar "
        "vermez, gözetmene <i>kanıtlı şüphe</i> üretir.",
        kind="danger"))

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════
    # SAYFA 3 — POSTERE NE KOYULMALI (CONTENT MASTER LIST)
    # ════════════════════════════════════════════════════════════
    story.append(SectionHeader(
        2, "Postere Mutlaka Girmesi Gereken İçerikler",
        "Eksiği olursa puan kırılır listesi"))
    story.append(Spacer(1, 6))

    # Wrap-edebilen hücreler için Paragraph stilleri
    cell_b = ParagraphStyle("cb", fontName="ArialTR-Bold", fontSize=8.5,
                            leading=11, textColor=PRIMARY_DARK)
    cell = ParagraphStyle("c", fontName="ArialTR", fontSize=8.5,
                          leading=11, textColor=TEXT)
    cell_h = ParagraphStyle("ch", fontName="ArialTR-Bold", fontSize=9,
                            leading=11, textColor=white,
                            alignment=TA_LEFT)

    def _row(num, name, what, where):
        return [num,
                Paragraph(name, cell_b),
                Paragraph(what, cell),
                Paragraph(where, cell)]

    must_data = [
        [Paragraph("#", cell_h),
         Paragraph("Bölüm", cell_h),
         Paragraph("Ne içermeli", cell_h),
         Paragraph("Yer", cell_h)],
        _row("1", "Başlık",
             "Proje adı + logo + üniversite + ders kodu + yıl",
             "Üst şerit, tam genişlik"),
        _row("2", "Problem",
             "3–4 cümle. Gözetmen dikkat darboğazı, manuel "
             "gözetimin ölçeklenmemesi.",
             "Sol sütun, üst"),
        _row("3", "Çözüm yaklaşımı",
             "AI asistan + insan karar. Otomatik karar VERMEZ "
             "(etik vurgusu).",
             "Sol sütun"),
        _row("4", "Sistem mimarisi",
             "Kamera → AI service (FastAPI + YOLOv8n + MediaPipe "
             "+ BoT-SORT) → WebSocket → Portal → Supabase.",
             "Orta sütun, en görünür yer"),
        _row("5", "AI pipeline",
             "Detection → Tracking → Multi-sinyal füzyon → "
             "Rule engine → Incident.",
             "Sağ sütun, üst"),
        _row("6", "Tespit edilen davranışlar",
             "17 incident tipi. TIER-1/2/3 olarak gruplandır. "
             "Severity rengiyle göster.",
             "Orta sütun, alt"),
        _row("7", "Demo görselleri",
             "Live monitor (bbox overlay), Exam wizard, "
             "Post-exam review, Sprint board.",
             "Sağ sütun, görsel ağır"),
        _row("8", "Sayısal sonuçlar",
             "Sprint sayısı, davranış tipi, model FPS/precision, "
             "maliyet, migration sayısı.",
             "Orta/sağ sütun (StatTiles)"),
        _row("9", "Tech stack rozetleri",
             "Next.js · React · TypeScript · Tailwind · shadcn · "
             "Supabase · FastAPI · YOLOv8n · OpenCV · MediaPipe · "
             "ArcFace · AWS CDK · ECS Fargate.",
             "Şerit, alt orta"),
        _row("10", "Etik &amp; KVKK kutusu",
             "“Sistem otomatik karar vermez.” + KVKK + IEEE etik "
             "referansı.",
             "Vurgulu kutu, alt sol"),
        _row("11", "Ekip",
             "5 üye + dev_role + supervisor (Fırat Akba). "
             "Avatar opsiyonel.",
             "Alt şerit, sol"),
        _row("12", "QR kod",
             "Demo videoya VEYA staging.horuseye.app’a link.",
             "Alt şerit, sağ"),
    ]
    tbl = Table(must_data, colWidths=[0.8 * cm, 2.8 * cm, 8.1 * cm, 4.0 * cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("FONT", (0, 1), (0, -1), "ArialTR-Bold", 9),
        ("TEXTCOLOR", (0, 1), (0, -1), PRIMARY_DARK),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, LIGHT_BG]),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, PRIMARY_DARK),
    ]))
    story.append(tbl)

    story.append(Spacer(1, 10))
    story.append(Callout(
        "Posterde yer almaması gerekenler",
        "• Gerçek öğrenci isimleri / yüzleri (KVKK ihlali). Demo verilerini "
        "anonimleştir.<br/>"
        "• Kullanılmayan PRD’ler veya yapılmamış işler — sadece sahaya "
        "çıkmış özellikleri yaz.<br/>"
        "• Uzun kod blokları. Kod yerine <i>akış diyagramı</i> + tek satır "
        "label.<br/>"
        "• 16 punt altındaki gövde metni — 1 metreden okunmaz.",
        kind="warning"))

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════
    # SAYFA 4 — HAZIR POSTER METİNLERİ
    # ════════════════════════════════════════════════════════════
    story.append(SectionHeader(
        3, "Hazır Poster Metinleri",
        "Kopyala-yapıştır kullanılabilir, gerekirse Çağla/Gizem editler"))
    story.append(Spacer(1, 6))

    story.append(Paragraph("PROBLEM (3 cümle, 60 kelime)", styles["H4"]))
    story.append(Callout(
        None,
        "Yüz yüze sınavlarda gözetmen başına 30+ öğrenci düşer; bakış "
        "kayması, telefon kullanımı ve komşuya yöneliş gibi kısa süreli "
        "kopya girişimleri kolayca gözden kaçar. Video kayıt üzerinden "
        "sınav sonrası inceleme saatler sürer ve kanıtlanması zordur. "
        "Otomatik bir gözetmen <b>asistanına</b> ihtiyaç vardır — "
        "gözetmeni <b>değil</b>, dikkatini ölçeklendiren.",
        kind="info"))

    story.append(Paragraph("ÇÖZÜM (3 cümle, 55 kelime)", styles["H4"]))
    story.append(Callout(
        None,
        "HorusEye, sınav salonundaki kameraları FastAPI tabanlı bir "
        "AI servisine bağlar; YOLOv8n + BoT-SORT + MediaPipe ile her "
        "öğrenciyi takip ederek <b>17 farklı davranış sinyalini</b> "
        "zamana yayılmış kurallarla birleştirir. Şüphe sınırını aşan "
        "olaylar <b>kanıt görüntüsüyle</b> gözetmene gerçek zamanlı "
        "düşer; sınav sonrası gözetmen olayı clean / suspicious / "
        "violation olarak işaretler.",
        kind="success"))

    story.append(Paragraph("FARK — “Neden bu proje?” (40 kelime)",
                           styles["H4"]))
    story.append(Callout(
        None,
        "Pazardaki ürünler ya tek kamerayla çalışır ya da “şüpheli” "
        "etiketini siyah kutu olarak verir. HorusEye <b>açıklanabilir</b> "
        "(her olayın hangi kuralı tetiklediği görülebilir), <b>çoklu "
        "kameralı</b> (telefon-as-camera dahil) ve <b>insan-merkezli</b> "
        "(otomatik karar vermez) olmasıyla ayrışır.",
        kind="danger"))

    story.append(Paragraph("TEKNOLOJİ ROZETLERİ — düz metin", styles["H4"]))
    story.append(Paragraph(
        "<font face='MonoTR' size='9'>"
        "Next.js 15 · React 19 · TypeScript · Tailwind v4 · shadcn/ui · "
        "Supabase (Postgres + Auth + Storage + RLS + pgvector) · FastAPI · "
        "WebSocket · YOLOv8n · BoT-SORT · MediaPipe FaceMesh · "
        "InsightFace ArcFace · OpenCV · AWS CDK · ECS Fargate · ALB · "
        "GitHub Actions"
        "</font>",
        styles["BodyMuted"]))

    story.append(Paragraph("KAPANIŞ — Etik kutusu metni", styles["H4"]))
    story.append(Callout(
        "Sistem otomatik karar VERMEZ",
        "Tüm tespitler insan incelemesi içindir. KVKK uyarınca yüz "
        "embedding’leri yalnızca aktif sınav süresince işlenir; "
        "kayıtlar 30 gün sonra silinir. Kararı <b>her zaman</b> "
        "yetkili gözetmen verir.",
        kind="warning"))

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════
    # SAYFA 5 — POSTER DÜZENİ (LAYOUT MOCKUP)
    # ════════════════════════════════════════════════════════════
    story.append(SectionHeader(
        4, "Önerilen Poster Düzeni",
        "A0 portre (841 × 1189 mm) için 7 bölgeli grid"))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "Aşağıdaki mockup, ziyaretçinin gözünün izlemesi gereken "
        "<b>Z-akışını</b> kurgular: başlık → sol sütun (problem) → "
        "orta sütun (mimari + nasıl çalışıyor) → sağ sütun (sonuç + "
        "demo) → alt bant (etik, ekip, QR).",
        styles["Body"]))
    story.append(Spacer(1, 8))
    story.append(PosterLayoutMockup())
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "Şema yalnızca konum referansıdır — gerçek tasarım Canva/Figma "
        "üzerinden yapılır (Çağla owns).",
        styles["Caption"]))

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════
    # SAYFA 6 — TASARIM SPESİFİKASYONU
    # ════════════════════════════════════════════════════════════
    story.append(SectionHeader(
        5, "Tasarım Spesifikasyonu",
        "Renk, tipografi, görsel dil — markaya sadık kalmak için"))

    story.append(Paragraph("Renk Paleti (light mode, HorusEye markası)",
                           styles["H3"]))
    story.append(ColorSwatches([
        ("HorusEye Red", "#c0392b", "primary"),
        ("Dark Red", "#8c2a1f", "primary-hover"),
        ("Slate Ink", "#0f172a", "metin"),
        ("Mute", "#64748b", "yardımcı metin"),
        ("Ivory", "#fdf2f0", "vurgu BG"),
        ("Paper", "#f8fafc", "kart BG"),
    ]))
    story.append(Spacer(1, 6))
    story.append(Callout(
        None,
        "Birincil renk <b>#c0392b</b> — portal favicon ile aynıdır "
        "(<font face='MonoTR' size='9'>SVG/favicon.svg</font>). "
        "Mevcut <i>HorusEye-Poster-Brief.md</i> dokümanında geçen "
        "<font face='MonoTR' size='9'>#1c5cff</font> eski Genç Beyinler "
        "etkinliği için kullanılmıştı; dönem sonu posteri için <b>marka "
        "kırmızısı</b> önerilir.",
        kind="info"))

    story.append(Paragraph("Tipografi", styles["H3"]))
    typo_data = [
        ["Rol", "Font ailesi", "Punto (A0’da)", "Not"],
        ["H1 (proje adı)", "Inter / DM Sans Bold", "150–180 pt",
         "Tek satırda kalmalı"],
        ["H2 (bölüm başlığı)", "Inter Bold", "48–60 pt",
         "Tüm sütunlarda aynı"],
        ["Gövde", "Inter Regular", "20–24 pt",
         "1 m mesafeden okunmalı"],
        ["Caption", "Inter Italic", "16 pt",
         "Açık gri (#64748b)"],
        ["Kod / monospace", "JetBrains Mono", "16–18 pt",
         "Sadece etiket/URL"],
    ]
    tbl = Table(typo_data,
                colWidths=[3.2 * cm, 4.3 * cm, 3.0 * cm, 5.2 * cm])
    tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "ArialTR-Bold", 9),
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT_BG),
        ("FONT", (0, 1), (-1, -1), "ArialTR", 9),
        ("TEXTCOLOR", (0, 0), (-1, 0), PRIMARY_DARK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, LIGHT_BG]),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
    ]))
    story.append(tbl)

    story.append(Paragraph("Görsel dil önerileri", styles["H3"]))
    for it in [
        "<b>İkonografi:</b> sadece <font face='MonoTR' size='9'>"
        "lucide-react</font> ikonları — portal ile birebir tutarlı.",
        "<b>Severity renkleri:</b> low → mavi, medium → amber, "
        "high → kırmızı, critical → koyu kırmızı (PRD-013 ile aynı).",
        "<b>Diyagram stili:</b> dolgusuz, ince çizgili kutular + ok. "
        "Gölge kullanma (baskıda çamur olur).",
        "<b>Boşluk (white space):</b> blok aralarında en az 24 mm "
        "boşluk bırak. Posterin yarısı boşluk, yarısı içerik gibi düşün.",
        "<b>Grid:</b> 3 sütun × 12 satır taban grid; tüm bloklar "
        "satır/sütun kenarlarına hizalı olmalı.",
    ]:
        story.append(Paragraph(f"•&nbsp;&nbsp;{it}", styles["Bullet"]))

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════
    # SAYFA 7 — SUNUM KONUŞMA PLANI
    # ════════════════════════════════════════════════════════════
    story.append(SectionHeader(
        6, "Sunum Konuşma Planı",
        "Poster önünde 30s / 2dk / 5dk sürümleri"))

    story.append(Paragraph("30 saniyelik versiyon (elevator)",
                           styles["H3"]))
    story.append(Callout(
        None,
        "“HorusEye, yüz yüze sınavlarda gözetmenin dikkatini "
        "ölçeklendiren bir AI asistanıdır. Kameralardan gelen görüntüyü "
        "gerçek zamanlı analiz eder; 17 farklı şüpheli davranışı "
        "skorlayıp <i>kanıt görüntüsüyle</i> gözetmenin önüne düşürür. "
        "Otomatik karar vermez — kararı gözetmen verir.”",
        kind="info"))

    story.append(Paragraph("2 dakikalık versiyon", styles["H3"]))
    for it in [
        "<b>0:00–0:20</b> · Problem: gözetmen dikkat darboğazı + manuel "
        "gözetim ölçeklenmiyor (sayı: 1 gözetmen / 30 öğrenci).",
        "<b>0:20–0:50</b> · Çözüm + mimari: kamera → AI service → "
        "WebSocket → Portal. AI iki sınıfta düşünür: <i>nesneler</i> "
        "(telefon, kulaklık, kağıt) ve <i>davranışlar</i> (bakış, baş "
        "dönüşü, komşuya yöneliş).",
        "<b>0:50–1:20</b> · Demo ekran: live monitor + bbox + incident ring.",
        "<b>1:20–1:40</b> · Sayılar: 22 PRD, 18 sprint, 53 migration, "
        "17 incident type, ~$60/ay bulut.",
        "<b>1:40–2:00</b> · Etik: insan-merkezli, KVKK uyumlu, açıklanabilir.",
    ]:
        story.append(Paragraph(f"•&nbsp;&nbsp;{it}", styles["Bullet"]))

    story.append(Paragraph("5 dakikalık versiyon (jüri sorusu için)",
                           styles["H3"]))
    for it in [
        "2dk’lık akışa ek olarak: <b>çoklu kamera + telefon-as-camera</b> "
        "(BL-310–320), <b>face_covering</b> tespiti (Sprint 18), <b>post-"
        "exam review</b> akışı (clean/suspicious/violation karar modal).",
        "<b>Veri:</b> Roboflow Universe dataset’leri + iç toplama (PRD-017, "
        "PRD-021). Custom YOLO fine-tune Sprint 15 ile başladı.",
        "<b>Mimari kararlar:</b> CPU-only (GPU değil), Fargate, "
        "BoT-SORT (ByteTrack değil — occlusion sonrası re-ID), "
        "MediaPipe (yaw>30° eşik).",
        "<b>Süreç:</b> Sprint backlog sistemi (PRD-018) — her BL bir "
        "PRD’ye bağlı, code review zorunlu, dependency enforcement.",
        "<b>Sınırlamalar:</b> Phase A şu an, Phase C (LSTM/GRU behavioral) "
        "yol haritasında.",
    ]:
        story.append(Paragraph(f"•&nbsp;&nbsp;{it}", styles["Bullet"]))

    story.append(Spacer(1, 6))
    story.append(Callout(
        "Sıkça gelen jüri sorularına hazır cevap",
        "<b>“Neden GPU kullanmadınız?”</b> YOLOv8n + selective MediaPipe "
        "CPU’da 4 vCPU ile %28’de çalışıyor — sınav saatleri dışı kapalı, "
        "aylık $60 maliyet.<br/>"
        "<b>“Yanlış pozitif?”</b> Cooldown + sustained window + multi-"
        "sinyal füzyon — tek frame’den karar verilmez. Severity hiyerarşisi "
        "ve insan onayı yanlış pozitifi nötralize eder.<br/>"
        "<b>“KVKK?”</b> Yüz embedding sınav süresince işlenir, kanıt "
        "kayıtları 30 gün, otomatik karar yok, açık rıza akışı var.",
        kind="warning"))

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════
    # SAYFA 8 — BASKI VE SON KONTROL LİSTESİ
    # ════════════════════════════════════════════════════════════
    story.append(SectionHeader(
        7, "Baskı Spesifikasyonu & Son Kontrol",
        "Matbaaya gönderilmeden önce gözden geçirilecek liste"))

    story.append(Paragraph("Baskı parametreleri", styles["H3"]))
    print_data = [
        ["Parametre", "Değer"],
        ["Boyut", "A0 portre (841 × 1189 mm) — bölümün talebine göre A1’e küçültülebilir"],
        ["Çözünürlük", "300 DPI (matbaa minimumu)"],
        ["Renk profili", "CMYK (Adobe RGB değil) — basıma yollanmadan dönüştürülmeli"],
        ["Kağıt", "Min. 200 g mat kuşe — parlak değil (yansıma yapar)"],
        ["Kenar payı (bleed)", "3 mm her yandan"],
        ["Yazı tipi", "PDF içine embed edilmeli (font outline)"],
        ["Çıkış formatı", "PDF/X-1a (matbaa standardı)"],
        ["Yedek", "PNG @ 300 DPI da hazırla — yedek için"],
    ]
    tbl = Table(print_data, colWidths=[4.5 * cm, 11.2 * cm])
    tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "ArialTR-Bold", 9.5),
        ("FONT", (0, 1), (-1, -1), "ArialTR", 9.5),
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, LIGHT_BG]),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
    ]))
    story.append(tbl)

    story.append(Paragraph("Son kontrol listesi (matbaaya göndermeden)",
                           styles["H3"]))
    checks = [
        "Tüm ekip üyeleri ve süpervizör posterin son hâlini onayladı",
        "Hiçbir ekran görüntüsünde gerçek öğrenci adı/yüzü yok "
        "(anonimleştirilmiş demo veri)",
        "QR kod incognito modda çalışıyor — link 404 değil",
        "Tüm yazı tipleri PDF’e embed edildi (font missing yok)",
        "Renk profili CMYK’ye dönüştürüldü",
        "Yazım denetimi yapıldı (Türkçe + İngilizce karışık metin "
        "için ekstra dikkat)",
        "1 metreden okunma testi: küçük poster çıktısı al, koridorda "
        "1 m uzaklıktan okuyabiliyor musun?",
        "Etik/KVKK kutusu görünüyor ve net okunuyor",
        "Logo + üniversite ismi + ders kodu üst şeritte mevcut",
        "Versiyon ve tarih damgası (poster alt sağ köşesinde küçük): "
        "“v1.0 · 2026-05-XX”",
    ]
    for c in checks:
        story.append(Paragraph(f"☐&nbsp;&nbsp;{c}", styles["Bullet"]))

    story.append(Spacer(1, 10))
    story.append(Callout(
        "Mevcut materyaller — yeniden kullan",
        "<b>docs/HorusEye-Poster-Brief.md</b> (Genç Beyinler için yazılmış "
        "kısa brief)<br/>"
        "<b>docs/cover-icon.png</b> + <b>docs/cover-wordmark.png</b> "
        "(yüksek çözünürlüklü logo)<br/>"
        "<b>SVG/favicon.svg</b> + <b>SVG/readme-icon.svg</b> "
        "(vektörel — büyütülünce piksellenmez)<br/>"
        "<b>docs/HorusEye-Presentation-Plan.md</b> (sunum akışı)<br/>"
        "<b>docs/HorusEye-Demo-Day-Checklist.md</b> (demo materyalleri)",
        kind="success"))

    story.append(Spacer(1, 14))
    story.append(HRFlowable(width="100%", thickness=0.6, color=BORDER))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "<i>Bu rehber HorusEye projesinin <b>14 Mayıs 2026 tarihindeki</b> "
        "kod tabanından (chore/roboflow-workspace-env dalı, Sprint 14–18 "
        "kapanmış) türetilmiştir. Phase B AI pipeline tamamlanmış, üretim "
        "promosyonu kullanıcı yetkilendirme için beklemededir.</i>",
        styles["Caption"]))

    return story


def main():
    out = os.path.join(SCRIPT_DIR, "HorusEye-Poster-Sunum-Rehberi.pdf")
    doc = SimpleDocTemplate(
        out,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=1.7 * cm,
        bottomMargin=1.9 * cm,
        title="HorusEye — Dönem Sonu Poster Sunum Rehberi",
        author="HorusEye Team",
        subject="A4 light-mode poster preparation guide",
    )
    doc.build(build_story(), onFirstPage=add_page_number,
              onLaterPages=add_page_number)
    size_kb = os.path.getsize(out) / 1024
    print(f"OK → {out}  ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
