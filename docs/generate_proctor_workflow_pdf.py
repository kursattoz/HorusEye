#!/usr/bin/env python3
"""HorusEye — Uçtan Uca Gözetmen (Proctor) Süreç Dokümanı (A4, light mode).

Bir gözetmenin sisteme ilk girişinden, sınav oluşturma sürecine ve sınav
günü canlı gözetim panelinin nasıl kullanılacağına, sınav sonrası
inceleme akışına kadar her ekranı sıralı şekilde anlatan referans
dokümandır. Posterin yanına yerleştirilebilir, jüriye dağıtılabilir.
"""

import os

from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
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

# ── Türkçe uyumlu fontlar ─────────────────────────────────────
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

# ── Light-mode HorusEye paleti ────────────────────────────────
PRIMARY = HexColor("#c0392b")
PRIMARY_DARK = HexColor("#8c2a1f")
PRIMARY_BG = HexColor("#fdf2f0")
ACCENT = HexColor("#f59e0b")
ACCENT_BG = HexColor("#fffbeb")
SUCCESS = HexColor("#16a34a")
SUCCESS_BG = HexColor("#ecfdf5")
INFO = HexColor("#0ea5e9")
INFO_BG = HexColor("#eff6ff")
PURPLE = HexColor("#7c3aed")
PURPLE_BG = HexColor("#f3e8ff")
TEXT = HexColor("#0f172a")
TEXT_MUTED = HexColor("#475569")
TEXT_LIGHT = HexColor("#64748b")
BORDER = HexColor("#e2e8f0")
BORDER_STRONG = HexColor("#94a3b8")
LIGHT_BG = HexColor("#f8fafc")
CARD_BG = HexColor("#ffffff")

W, H = A4
MARGIN = 1.6 * cm


# ── Özel Flowable'lar ─────────────────────────────────────────


class CoverHero(Flowable):
    """Kapak — HorusEye logo + alt başlık."""

    def wrap(self, aw, ah):
        self.w = aw
        return (aw, 240)

    def draw(self):
        c = self.canv
        c.setFillColor(PRIMARY_BG)
        c.roundRect(0, 0, self.w, 240, 18, fill=1, stroke=0)

        cx, cy = self.w / 2, 170
        c.setFillColor(PRIMARY)
        c.ellipse(cx - 56, cy - 18, cx + 56, cy + 18, fill=1, stroke=0)
        c.setFillColor(white)
        c.circle(cx, cy, 14, fill=1, stroke=0)
        c.setFillColor(PRIMARY_DARK)
        c.circle(cx, cy, 6, fill=1, stroke=0)

        c.setFillColor(PRIMARY)
        c.setFont("ArialTR-Bold", 30)
        c.drawCentredString(cx - 18, 108, "horus")
        c.setFillColor(TEXT_LIGHT)
        c.setFont("ArialTR", 30)
        c.drawString(cx + 28, 108, "eye")

        c.setFillColor(TEXT_MUTED)
        c.setFont("ArialTR", 11)
        c.drawCentredString(
            cx, 82, "Yapay Zekâ Destekli Sınav Gözetim Sistemi"
        )

        c.setStrokeColor(PRIMARY)
        c.setLineWidth(1.2)
        c.line(cx - 60, 66, cx + 60, 66)

        c.setFillColor(PRIMARY)
        c.setFont("ArialTR-Bold", 16)
        c.drawCentredString(cx, 40, "Uçtan Uca Gözetmen Süreç Dokümanı")

        c.setFillColor(TEXT_LIGHT)
        c.setFont("ArialTR-Italic", 9.5)
        c.drawCentredString(
            cx, 22, "Giriş · Hazırlık · Sınav Oluşturma · Canlı Gözetim · Sınav Sonrası"
        )


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
        c.setFillColor(PRIMARY)
        c.roundRect(0, h - 32, 30, 30, 6, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("ArialTR-Bold", 12)
        c.drawCentredString(15, h - 22, self.num)
        c.setFillColor(PRIMARY)
        c.setFont("ArialTR-Bold", 17)
        c.drawString(40, h - 22, self.title)
        if self.subtitle:
            c.setFillColor(TEXT_LIGHT)
            c.setFont("ArialTR-Italic", 9.5)
            c.drawString(40, h - 38, self.subtitle)
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
            "purple": (PURPLE_BG, PURPLE),
        }[self.kind]

    def draw(self):
        c = self.canv
        bg, stripe = self._colors()
        c.setFillColor(bg)
        c.roundRect(0, 0, self.w, self.total_h, 6, fill=1, stroke=0)
        c.setFillColor(stripe)
        c.rect(0, 0, 4, self.total_h, fill=1, stroke=0)
        if self.title:
            c.setFillColor(stripe)
            c.setFont("ArialTR-Bold", 10.5)
            c.drawString(18, self.total_h - 14, self.title)
        self.para.drawOn(c, 18, 8)


class PhaseCard(Flowable):
    """Bir faz için renkli numaralı kart — başlık + route + süre tag'i + body."""

    def __init__(self, num, title, route, when, body, kind="primary"):
        super().__init__()
        self.num = num
        self.title = title
        self.route = route
        self.when = when
        self.body = body
        self.kind = kind

    def wrap(self, aw, ah):
        self.w = aw
        style = ParagraphStyle(
            "pcb",
            fontName="ArialTR",
            fontSize=9.5,
            leading=13.5,
            textColor=TEXT,
        )
        p = Paragraph(self.body, style)
        pw, ph = p.wrap(self.w - 80, ah)
        self.para = p
        self.para_h = ph
        self.total_h = max(ph + 50, 80)
        return (aw, self.total_h)

    def _stripe(self):
        return {
            "primary": PRIMARY,
            "info": INFO,
            "success": SUCCESS,
            "warning": ACCENT,
            "purple": PURPLE,
        }[self.kind]

    def draw(self):
        c = self.canv
        stripe = self._stripe()
        # Kart arka planı
        c.setFillColor(CARD_BG)
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.8)
        c.roundRect(0, 0, self.w, self.total_h, 8, fill=1, stroke=1)
        # Sol numara kolonu
        c.setFillColor(stripe)
        c.roundRect(0, 0, 56, self.total_h, 8, fill=1, stroke=0)
        # Numara
        c.setFillColor(white)
        c.setFont("ArialTR-Bold", 26)
        c.drawCentredString(28, self.total_h - 30, str(self.num))
        # "FAZ" rozeti
        c.setFont("ArialTR-Bold", 7)
        c.drawCentredString(28, self.total_h - 44, "FAZ")
        # Süre tag'i
        c.setFont("ArialTR", 7.5)
        c.drawCentredString(28, 14, self.when)
        # Başlık + route
        c.setFillColor(TEXT)
        c.setFont("ArialTR-Bold", 12)
        c.drawString(70, self.total_h - 20, self.title)
        c.setFillColor(stripe)
        c.setFont("MonoTR-Bold", 8.5)
        c.drawString(70, self.total_h - 34, self.route)
        # Body
        self.para.drawOn(c, 70, 10)


class ScreenMock(Flowable):
    """Tarayıcı çerçevesi içinde basit bir ekran mockup'ı (ASCII benzeri)."""

    def __init__(self, route, blocks, height=140):
        """blocks: [(label, sub, color)] — üstten alta sıralanır."""
        super().__init__()
        self.route = route
        self.blocks = blocks
        self.height = height

    def wrap(self, aw, ah):
        self.w = aw
        return (aw, self.height)

    def draw(self):
        c = self.canv
        h = self.height
        # Browser frame
        c.setFillColor(LIGHT_BG)
        c.setStrokeColor(BORDER_STRONG)
        c.setLineWidth(0.8)
        c.roundRect(0, 0, self.w, h, 6, fill=1, stroke=1)
        # Title bar
        c.setFillColor(HexColor("#e5e7eb"))
        c.roundRect(0, h - 22, self.w, 22, 6, fill=1, stroke=0)
        c.setFillColor(HexColor("#ef4444"))
        c.circle(12, h - 11, 4, fill=1, stroke=0)
        c.setFillColor(HexColor("#f59e0b"))
        c.circle(26, h - 11, 4, fill=1, stroke=0)
        c.setFillColor(HexColor("#22c55e"))
        c.circle(40, h - 11, 4, fill=1, stroke=0)
        # URL bar
        c.setFillColor(white)
        c.setStrokeColor(BORDER)
        c.roundRect(60, h - 18, self.w - 80, 14, 3, fill=1, stroke=1)
        c.setFillColor(TEXT_LIGHT)
        c.setFont("MonoTR", 7.5)
        c.drawString(66, h - 14, f"horuseye.app{self.route}")
        # Sidebar stub
        c.setFillColor(white)
        c.rect(0, 0, 50, h - 22, fill=1, stroke=0)
        c.setStrokeColor(BORDER)
        c.line(50, 0, 50, h - 22)
        c.setFillColor(PRIMARY)
        c.circle(25, h - 38, 6, fill=1, stroke=0)
        c.setFillColor(BORDER)
        for i in range(5):
            c.rect(12, h - 60 - i * 14, 26, 6, fill=1, stroke=0)
        # Content blocks
        content_x = 60
        content_w = self.w - 70
        content_top = h - 32
        avail = content_top - 10
        block_count = len(self.blocks)
        block_h = (avail - 6 * (block_count - 1)) / block_count
        y = content_top - block_h
        for label, sub, color in self.blocks:
            c.setFillColor(color)
            c.roundRect(content_x, y, content_w, block_h, 4, fill=1, stroke=0)
            c.setFillColor(TEXT)
            c.setFont("ArialTR-Bold", 9)
            c.drawString(content_x + 8, y + block_h - 14, label)
            if sub:
                c.setFillColor(TEXT_LIGHT)
                c.setFont("ArialTR", 7.5)
                c.drawString(content_x + 8, y + block_h - 26, sub)
            y -= block_h + 6


class WorkflowTimeline(Flowable):
    """T-7 → T+3 yatay timeline — 5 faz için."""

    def wrap(self, aw, ah):
        self.w = aw
        return (aw, 180)

    def draw(self):
        c = self.canv
        h = 180
        # Arka plan
        c.setFillColor(LIGHT_BG)
        c.setStrokeColor(BORDER)
        c.roundRect(0, 0, self.w, h, 8, fill=1, stroke=1)

        # Yatay zaman ekseni
        axis_y = 90
        margin_x = 30
        c.setStrokeColor(BORDER_STRONG)
        c.setLineWidth(1.5)
        c.line(margin_x, axis_y, self.w - margin_x, axis_y)
        # ok ucu
        c.setFillColor(BORDER_STRONG)
        p = c.beginPath()
        p.moveTo(self.w - margin_x, axis_y)
        p.lineTo(self.w - margin_x - 8, axis_y + 4)
        p.lineTo(self.w - margin_x - 8, axis_y - 4)
        p.close()
        c.drawPath(p, fill=1, stroke=0)

        phases = [
            (1, "Giriş", "T-7", "Login + onboarding", INFO),
            (2, "Hazırlık", "T-5", "Oda + öğrenci import", PURPLE),
            (3, "Oluşturma", "T-2", "Sınav wizard", ACCENT),
            (4, "Sınav Günü", "T-0", "Canlı gözetim", PRIMARY),
            (5, "İnceleme", "T+3", "Review + rapor", SUCCESS),
        ]

        usable = self.w - 2 * margin_x
        step = usable / (len(phases) - 1)
        for i, (n, label, t, sub, col) in enumerate(phases):
            x = margin_x + i * step
            # nokta
            c.setFillColor(col)
            c.circle(x, axis_y, 9, fill=1, stroke=0)
            c.setFillColor(white)
            c.setFont("ArialTR-Bold", 9)
            c.drawCentredString(x, axis_y - 3, str(n))
            # üst etiket
            c.setFillColor(col)
            c.setFont("ArialTR-Bold", 9.5)
            c.drawCentredString(x, axis_y + 28, label)
            c.setFillColor(TEXT_LIGHT)
            c.setFont("MonoTR", 7.5)
            c.drawCentredString(x, axis_y + 16, t)
            # alt açıklama
            c.setFillColor(TEXT_MUTED)
            c.setFont("ArialTR", 8)
            c.drawCentredString(x, axis_y - 22, sub)

        # Başlık
        c.setFillColor(TEXT)
        c.setFont("ArialTR-Bold", 10.5)
        c.drawString(margin_x, h - 18, "Gözetmenin uçtan uca takvimi")
        c.setFillColor(TEXT_LIGHT)
        c.setFont("ArialTR-Italic", 8.5)
        c.drawString(margin_x, h - 30,
                     "T = sınav günü · negatif değerler hazırlık günlerini gösterir")

        # Alt açıklama
        c.setFillColor(TEXT_LIGHT)
        c.setFont("ArialTR-Italic", 8)
        c.drawString(
            margin_x, 12,
            "Süreler önerilen minimumdur — gerçek planlama ekibe göre değişir."
        )


class LiveMonitorMock(Flowable):
    """/exams/[id]/live ekranının büyük mockup'ı — kamera grid + incident feed."""

    def wrap(self, aw, ah):
        self.w = aw
        return (aw, 260)

    def draw(self):
        c = self.canv
        h = 260
        # Browser frame
        c.setFillColor(LIGHT_BG)
        c.setStrokeColor(BORDER_STRONG)
        c.setLineWidth(0.8)
        c.roundRect(0, 0, self.w, h, 8, fill=1, stroke=1)
        # Title bar
        c.setFillColor(HexColor("#e5e7eb"))
        c.roundRect(0, h - 24, self.w, 24, 8, fill=1, stroke=0)
        for i, col in enumerate([HexColor("#ef4444"), HexColor("#f59e0b"),
                                 HexColor("#22c55e")]):
            c.setFillColor(col)
            c.circle(14 + i * 14, h - 12, 4, fill=1, stroke=0)
        c.setFillColor(white)
        c.setStrokeColor(BORDER)
        c.roundRect(70, h - 20, self.w - 90, 16, 3, fill=1, stroke=1)
        c.setFillColor(TEXT_LIGHT)
        c.setFont("MonoTR", 8)
        c.drawString(76, h - 14, "horuseye.app/exams/exam_42/live")
        # Sidebar
        c.setFillColor(white)
        c.rect(0, 0, 50, h - 24, fill=1, stroke=0)
        c.setStrokeColor(BORDER)
        c.line(50, 0, 50, h - 24)
        c.setFillColor(PRIMARY)
        c.circle(25, h - 40, 6, fill=1, stroke=0)

        content_x = 60
        content_top = h - 34
        content_h = content_top - 10

        # Sayfa başlığı
        c.setFillColor(TEXT)
        c.setFont("ArialTR-Bold", 10.5)
        c.drawString(content_x, content_top - 12, "Live monitor — CMPE 492 Final")
        # Connection pill
        c.setFillColor(SUCCESS_BG)
        c.roundRect(content_x + 200, content_top - 18, 64, 14, 7, fill=1, stroke=0)
        c.setFillColor(SUCCESS)
        c.circle(content_x + 209, content_top - 11, 3, fill=1, stroke=0)
        c.setFont("ArialTR-Bold", 7.5)
        c.drawString(content_x + 215, content_top - 13, "LIVE")

        # Camera grid (sol — 2x2) + sağ panel
        grid_top = content_top - 28
        grid_h = content_h - 28
        grid_w = (self.w - content_x - 10) * 0.62
        feed_w = (self.w - content_x - 10) * 0.34
        feed_x = content_x + grid_w + 8

        # Kamera kutuları (2x2)
        cell_w = (grid_w - 6) / 2
        cell_h = (grid_h - 6) / 2
        cams = [
            ("CAM-01 · Lab A", True, 3),
            ("CAM-02 · Lab A", False, 0),
            ("CAM-03 · Lab A", False, 1),
            ("CAM-04 · Phone-paired", True, 0),
        ]
        for idx, (label, has_alert, bbox_count) in enumerate(cams):
            r = idx // 2
            col = idx % 2
            x = content_x + col * (cell_w + 6)
            y = grid_top - (r + 1) * cell_h - r * 6
            # video pane (dark)
            c.setFillColor(HexColor("#1f2937"))
            c.roundRect(x, y, cell_w, cell_h, 4, fill=1, stroke=0)
            # label
            c.setFillColor(white)
            c.setFont("ArialTR-Bold", 7.5)
            c.drawString(x + 6, y + cell_h - 12, label)
            # fake bboxes
            for b in range(bbox_count):
                bx = x + 12 + b * 18
                by = y + 14
                c.setStrokeColor(PRIMARY if (b == 0 and has_alert) else SUCCESS)
                c.setLineWidth(1.2)
                c.rect(bx, by, 14, 22, fill=0, stroke=1)
            # severity ring overlay
            if has_alert:
                c.setStrokeColor(PRIMARY)
                c.setLineWidth(2)
                c.rect(x + 2, y + 2, cell_w - 4, cell_h - 4, fill=0, stroke=1)

        # Incident feed (sağ panel)
        c.setFillColor(white)
        c.setStrokeColor(BORDER)
        c.roundRect(feed_x, grid_top - grid_h, feed_w, grid_h, 4, fill=1, stroke=1)
        c.setFillColor(TEXT)
        c.setFont("ArialTR-Bold", 8.5)
        c.drawString(feed_x + 8, grid_top - 12, "Incident feed")
        c.setFillColor(TEXT_LIGHT)
        c.setFont("ArialTR", 7)
        c.drawRightString(feed_x + feed_w - 8, grid_top - 12, "3 events")

        # Feed items
        incidents = [
            ("phone_in_hand", "CAM-01 · 14:23", "HIGH", PRIMARY),
            ("sustained_gaze", "CAM-01 · 14:19", "MEDIUM", ACCENT),
            ("empty_seat", "CAM-03 · 14:11", "LOW", INFO),
        ]
        item_y = grid_top - 26
        for title, meta, sev, sev_col in incidents:
            c.setFillColor(LIGHT_BG)
            c.roundRect(feed_x + 6, item_y - 36, feed_w - 12, 34, 3, fill=1, stroke=0)
            c.setFillColor(sev_col)
            c.rect(feed_x + 6, item_y - 36, 2.5, 34, fill=1, stroke=0)
            c.setFillColor(TEXT)
            c.setFont("MonoTR-Bold", 7.5)
            c.drawString(feed_x + 14, item_y - 12, title)
            c.setFillColor(TEXT_LIGHT)
            c.setFont("ArialTR", 6.8)
            c.drawString(feed_x + 14, item_y - 21, meta)
            c.setFillColor(sev_col)
            c.setFont("ArialTR-Bold", 6.8)
            c.drawRightString(feed_x + feed_w - 10, item_y - 12, sev)
            # evidence thumb
            c.setFillColor(HexColor("#374151"))
            c.rect(feed_x + feed_w - 32, item_y - 32, 22, 16, fill=1, stroke=0)
            item_y -= 40


class DecisionBox(Flowable):
    """Edge-case karar kutuları — durum / aksiyon / sonuç."""

    def __init__(self, rows):
        super().__init__()
        self.rows = rows  # [(case, action, result, kind)]

    def wrap(self, aw, ah):
        self.w = aw
        self.row_h = 50
        return (aw, self.row_h * len(self.rows) + 8)

    def draw(self):
        c = self.canv
        for i, (case, action, result, kind) in enumerate(self.rows):
            y = (len(self.rows) - i - 1) * self.row_h
            kind_col = {"danger": PRIMARY, "warning": ACCENT,
                        "info": INFO, "success": SUCCESS}[kind]
            # Kart
            c.setFillColor(CARD_BG)
            c.setStrokeColor(BORDER)
            c.setLineWidth(0.6)
            c.roundRect(0, y + 4, self.w, self.row_h - 6, 6, fill=1, stroke=1)
            # Sol şerit
            c.setFillColor(kind_col)
            c.rect(0, y + 4, 4, self.row_h - 6, fill=1, stroke=0)

            col_w = (self.w - 16) / 3
            # Sütun 1 — durum
            c.setFillColor(kind_col)
            c.setFont("ArialTR-Bold", 8)
            c.drawString(12, y + self.row_h - 14, "DURUM")
            c.setFillColor(TEXT)
            c.setFont("ArialTR", 8.5)
            self._wrap_text(c, case, 12, y + self.row_h - 26, col_w - 4)
            # Ayraç
            c.setStrokeColor(BORDER)
            c.line(12 + col_w, y + 10, 12 + col_w, y + self.row_h - 6)
            # Sütun 2 — aksiyon
            c.setFillColor(kind_col)
            c.setFont("ArialTR-Bold", 8)
            c.drawString(20 + col_w, y + self.row_h - 14, "AKSIYON")
            c.setFillColor(TEXT)
            c.setFont("ArialTR", 8.5)
            self._wrap_text(c, action, 20 + col_w, y + self.row_h - 26, col_w - 4)
            # Ayraç
            c.line(20 + 2 * col_w, y + 10, 20 + 2 * col_w, y + self.row_h - 6)
            # Sütun 3 — sonuç
            c.setFillColor(kind_col)
            c.setFont("ArialTR-Bold", 8)
            c.drawString(28 + 2 * col_w, y + self.row_h - 14, "SONUÇ")
            c.setFillColor(TEXT)
            c.setFont("ArialTR", 8.5)
            self._wrap_text(c, result, 28 + 2 * col_w, y + self.row_h - 26,
                            col_w - 12)

    def _wrap_text(self, c, text, x, y, max_w):
        """Kelime kelime sar — 8.5 punt arial için."""
        from reportlab.pdfbase.pdfmetrics import stringWidth
        words = text.split()
        line = ""
        ly = y
        for w in words:
            test = (line + " " + w).strip()
            if stringWidth(test, "ArialTR", 8.5) > max_w:
                c.drawString(x, ly, line)
                line = w
                ly -= 10
            else:
                line = test
        if line:
            c.drawString(x, ly, line)


# ── Sayfa numarası ────────────────────────────────────────────
def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 1.5 * cm, W - MARGIN, 1.5 * cm)
    canvas.setFont("ArialTR", 8)
    canvas.setFillColor(TEXT_LIGHT)
    canvas.drawString(MARGIN, 1.0 * cm,
                      "HorusEye · Uçtan Uca Gözetmen Süreç Dokümanı")
    canvas.drawRightString(W - MARGIN, 1.0 * cm, f"Sayfa {doc.page}")
    canvas.restoreState()


# ── Stiller ──────────────────────────────────────────────────
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
    s["Caption"] = ParagraphStyle(
        "Caption", fontName="ArialTR-Italic", fontSize=8.5, leading=11,
        textColor=TEXT_LIGHT, alignment=TA_CENTER, spaceAfter=6)
    return s


# ── İçerik ───────────────────────────────────────────────────
def build_story():
    styles = get_styles()
    story = []

    # ════════════════════════════════════════════════════════════
    # SAYFA 1 — KAPAK
    # ════════════════════════════════════════════════════════════
    story.append(Spacer(1, 8))
    story.append(CoverHero())
    story.append(Spacer(1, 20))

    story.append(Paragraph(
        "Bu doküman, bir <b>gözetmenin (proctor)</b> HorusEye sistemine "
        "ilk girişinden sınav sonrası rapora kadar geçtiği <b>her ekranı, "
        "her butonu ve her kararı</b> sırayla anlatır. Demo Day jüri "
        "ziyaretlerinde, gözetmen onboarding'inde ve teknik olmayan "
        "paydaşlara sistemi tanıtmada referans olarak kullanılmak üzere "
        "hazırlanmıştır.",
        styles["Body"]))
    story.append(Spacer(1, 12))

    meta_data = [
        ["Doküman amacı",
         "Bir gözetmenin uçtan uca yaşam döngüsünün ekran-bazlı haritası"],
        ["Hedef okuyucu",
         "Demo jürisi · yeni gözetmen kullanıcı · ekip dışı paydaş"],
        ["Kapsam",
         "Login → Oda/öğrenci hazırlığı → Sınav oluşturma → Canlı "
         "gözetim → Sınav sonrası inceleme"],
        ["Bu doküman değildir",
         "Geliştirici dokümantasyonu (PRD-013, PRD-019 oraya bakar) · "
         "AI pipeline iç işleyişi"],
        ["Kaynak doğruluğu",
         "portal/app routes + PRD-013, PRD-019, PRD-020 üzerinden "
         "üretildi (2026-05-15)"],
        ["İlişkili dokümanlar",
         "HorusEye-Presentation-Plan.md · HorusEye-Poster-Sunum-Rehberi.pdf"],
    ]
    tbl = Table(meta_data, colWidths=[3.4 * cm, 12.3 * cm])
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
    story.append(Spacer(1, 14))

    story.append(Callout(
        "Hızlı cevap — Gözetmen paneli nerede?",
        "Sidebar'da <b>“Live Monitor”</b> diye ayrı bir link <b>yok</b>. "
        "Bilinçli bir karar: canlı panelin sınav bağlamı dışında anlamı "
        "yoktur. Gözetmen panelinin adresi "
        "<font face='MonoTR' size='9'>/exams/[id]/live</font> — "
        "sidebar &gt; <b>Exams</b> &gt; ilgili sınava tıkla &gt; "
        "session card üzerindeki <b>Live Monitor</b> butonu ile açılır.",
        kind="danger"))

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════
    # SAYFA 2 — GENEL BAKIŞ + TIMELINE + ROLLER
    # ════════════════════════════════════════════════════════════
    story.append(SectionHeader(
        1, "Genel Bakış: Beş Faz",
        "Gözetmenin sistemi kullandığı tüm süreç tek bir takvimde"))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "HorusEye'da gözetmen yolculuğu <b>beş bağımsız faza</b> ayrılır. "
        "Faz 1–3 sınav öncesi hazırlık günlerinde, Faz 4 sınav günü "
        "gerçek zamanlı, Faz 5 sınavdan sonraki gün(ler)de yapılır.",
        styles["Body"]))

    story.append(WorkflowTimeline())
    story.append(Spacer(1, 10))

    story.append(Paragraph("Rol matrisi — kim hangi ekranı görür", styles["H3"]))

    role_data = [
        ["Ekran / Modül", "admin", "supervisor", "assistant"],
        ["Dashboard", "✓", "✓", "✓"],
        ["Sprints / Calendar / Reports / Feedback", "✓", "✓", "✓"],
        ["Files (proje dosyaları)", "✓", "—", "—"],
        ["Team (ekip yönetimi)", "✓", "—", "—"],
        ["Exams · Analytics", "✓", "✓", "✓"],
        ["Students (öğrenci listesi)", "✓", "✓", "✓"],
        ["Exam Rooms (oda CRUD)", "✓", "—", "—"],
        ["Datasets · Cam Overlap (admin tools)", "✓", "—", "—"],
        ["Dev Monitor (system health)", "✓", "—", "—"],
        ["Live Monitor /exams/[id]/live", "✓", "✓", "✓"],
    ]
    tbl = Table(role_data, colWidths=[7.5 * cm, 2.4 * cm, 2.9 * cm, 2.9 * cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONT", (0, 0), (-1, 0), "ArialTR-Bold", 9),
        ("FONT", (0, 1), (-1, -1), "ArialTR", 9),
        ("FONT", (0, 1), (0, -1), "ArialTR-Bold", 9),
        ("TEXTCOLOR", (0, 1), (0, -1), TEXT),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, LIGHT_BG]),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
    ]))
    story.append(tbl)

    story.append(Spacer(1, 8))
    story.append(Callout(
        None,
        "Bu dokümandaki ekranlar varsayılan olarak <b>supervisor</b> "
        "rolünden anlatılır. Admin için ekstra erişim notları her fazın "
        "altında belirtilmiştir.",
        kind="info"))

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════
    # SAYFA 3 — FAZ 1: GİRİŞ
    # ════════════════════════════════════════════════════════════
    story.append(SectionHeader(
        2, "FAZ 1 — Giriş ve İlk Kurulum",
        "Sınavdan ~7 gün önce · Süre: 5 dakika"))
    story.append(Spacer(1, 6))

    story.append(PhaseCard(
        "1.1", "Giriş ekranı", "/login", "T-7 · 1 dk",
        "Supervisor email + geçici şifre. Supabase Auth doğrular. "
        "Magic-link veya OAuth desteklenmez — kapalı sistem olarak "
        "tasarlandığı için sadece email-şifre.",
        kind="info"))
    story.append(Spacer(1, 6))

    story.append(PhaseCard(
        "1.2", "İlk girişte şifre değiştirme", "/change-password",
        "T-7 · 2 dk",
        "Geçici şifre ile giren kullanıcı otomatik buraya yönlendirilir. "
        "Yeni şifre kuralları sayfada listelenir. Bu adım atlanırsa "
        "diğer sayfalara erişim middleware ile engellenir.",
        kind="info"))
    story.append(Spacer(1, 6))

    story.append(PhaseCard(
        "1.3", "Dashboard — açılış ekranı", "/dashboard", "T-7 · 2 dk",
        "Giriş sonrası varsayılan sayfa. Bugün/yarın için aktif sınavlar, "
        "son 24 saatte üretilen incident özetleri, suspicion area grafiği "
        "(<i>SuspicionAreaChart</i>) ve sprint widget'ları görünür. "
        "Buradan sidebar üzerinden hedeflenen modüle geçilir.",
        kind="info"))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Bu fazda gözetmen şunları yapar:", styles["H4"]))
    for it in [
        "Email + geçici şifre ile sisteme girer.",
        "Kalıcı şifre tanımlar ve <i>change-password</i> akışını tamamlar.",
        "Dashboard'da bekleyen sınavlarını görür, sidebar yapısını tanır.",
        "<b>Settings &gt; Profile</b> üzerinden ad-soyad, görev unvanı "
        "ve bildirim tercihlerini günceller (opsiyonel).",
    ]:
        story.append(Paragraph(f"•&nbsp;&nbsp;{it}", styles["Bullet"]))

    story.append(Spacer(1, 6))
    story.append(Callout(
        "Onboarding notu",
        "İlk girişte sidebar'daki <b>Exam Module</b> grubu boştur — "
        "henüz sınav yok. Bu doğal. Bir sonraki adım odalar ve öğrenci "
        "listesini hazırlamaktır.",
        kind="success"))

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════
    # SAYFA 4 — FAZ 2: HAZIRLIK
    # ════════════════════════════════════════════════════════════
    story.append(SectionHeader(
        3, "FAZ 2 — Hazırlık (Odalar + Öğrenciler)",
        "Sınavdan ~5 gün önce · Süre: 20-30 dakika"))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "Sınav oluşturulabilmesi için iki ön koşul vardır: <b>en az bir "
        "sınav odası</b> ve <b>öğrenci listesi</b>. Bu kayıtlar bir kez "
        "girilir, sonraki tüm sınavlarda yeniden kullanılır.",
        styles["Body"]))

    story.append(Spacer(1, 4))
    story.append(PhaseCard(
        "2.1", "Sınav odası ekleme (yalnız admin)", "/exam-rooms",
        "T-5 · 5 dk/oda",
        "<b>“Add room”</b> butonu açılır → modal: oda adı (örn. <i>Lab A</i>), "
        "kapasite, kat/blok, kamera RTSP adresi(leri), kamera konumu "
        "(masaüstü/tavan/duvar). Kaydedildikten sonra oda kartı listede "
        "<i>active</i> rozetiyle görünür.",
        kind="purple"))
    story.append(Spacer(1, 6))

    story.append(PhaseCard(
        "2.2", "Öğrenci CSV içe aktarımı", "/students", "T-5 · 10 dk",
        "<b>“Import CSV”</b> butonu → drag-and-drop alanı. CSV formatı: "
        "<font face='MonoTR' size='8.5'>name, email, student_no</font> "
        "(şablon: docs/sample-students.csv). Import sonrası progress bar, "
        "duplicate satırlar için <i>skip / overwrite</i> seçenekleri. "
        "Başarılı satırlar tabloda anında görünür.",
        kind="purple"))
    story.append(Spacer(1, 6))

    story.append(PhaseCard(
        "2.3", "Özel durumlar (opsiyonel)", "/students/[id]",
        "T-5 · 2 dk/öğrenci",
        "Bir öğrenciye tıklayınca profil sayfası açılır. ADHD, anksiyete "
        "veya fiziksel engel gibi durumlar için <b>per-student threshold "
        "override</b> tanımlanır (PRD-013 §16). Örneğin ADHD'li bir "
        "öğrenci için gaze_diversion eşiği 3→8'e çıkarılır.",
        kind="purple"))

    story.append(Spacer(1, 10))
    story.append(Paragraph("Hızlı ekran şeması — /students", styles["H4"]))
    story.append(ScreenMock("/students", [
        ("Üst: Filter bar + 'Import CSV' butonu", "search · role · status",
         PRIMARY_BG),
        ("Orta: DataTable — ad, email, no, eklenme tarihi",
         "her satır clickable → /students/[id]", LIGHT_BG),
        ("Alt: Pagination + 'Add student' single-row butonu",
         "20/50/100 per page", LIGHT_BG),
    ], height=120))

    story.append(Spacer(1, 8))
    story.append(Callout(
        "Bu fazın bittiğinin işareti",
        "Sidebar &gt; <b>Students</b> sayfasında en az 10 öğrenci listelenir, "
        "Sidebar &gt; <b>Rooms</b> sayfasında en az 1 oda <i>active</i> "
        "durumdadır. Aksi halde Faz 3'teki sınav oluşturma wizard'ı "
        "öğrenci/oda seçim adımında boş kalır.",
        kind="success"))

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════
    # SAYFA 5 — FAZ 3: SINAV OLUŞTURMA
    # ════════════════════════════════════════════════════════════
    story.append(SectionHeader(
        4, "FAZ 3 — Sınav Oluşturma",
        "Sınavdan ~2 gün önce · Süre: 10 dakika · Multi-step wizard"))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "Sınav nesnesi sistemdeki en kritik birimdir — odalar, öğrenciler "
        "ve gelecekteki canlı izleme oturumu bu nesneye bağlanır. "
        "Oluşturma süreci dört adımlı bir wizard'dır.",
        styles["Body"]))

    story.append(Spacer(1, 4))
    story.append(PhaseCard(
        "3.1", "Sınav listesi → 'New Exam'", "/exams", "T-2 · 30 sn",
        "Mevcut sınavların listesi. Sağ üstte <b>“New exam”</b> butonu. "
        "Geçmiş sınavlar buradan yeniden açılıp <i>clone</i> edilebilir "
        "(metadata + öğrenci listesi kopyalanır, yeni tarih atanır).",
        kind="warning"))
    story.append(Spacer(1, 6))

    story.append(PhaseCard(
        "3.2", "Adım 1 — Sınav meta verisi", "/exams/new (Step 1/4)",
        "T-2 · 2 dk",
        "Sınav adı (örn. <i>CMPE 492 Final Sınavı</i>), ders kodu, "
        "açıklama, sınav günü ve toplam süre (dakika). Bu alanlar "
        "rapor başlıklarında ve incident metadatasında yer alır.",
        kind="warning"))
    story.append(Spacer(1, 6))

    story.append(PhaseCard(
        "3.3", "Adım 2 — Session ekle (oda + saat)",
        "/exams/new (Step 2/4)", "T-2 · 3 dk",
        "Her oturum (session) <b>tek bir odaya</b> bağlanır. <i>Add session</i> "
        "→ oda seç (Faz 2.1'de tanımlananlar listelenir) → başlangıç saati. "
        "Aynı sınav için birden fazla session eklenebilir (örn. iki ayrı "
        "labda paralel sınav).",
        kind="warning"))
    story.append(Spacer(1, 6))

    story.append(PhaseCard(
        "3.4", "Adım 3 — Öğrenci ataması", "/exams/new (Step 3/4)",
        "T-2 · 3 dk",
        "Faz 2.2'deki öğrenci havuzundan multi-select. Filter: ders kodu, "
        "yıl, bölüm. Tüm liste seçilebilir veya CSV'den ikinci bir "
        "import yapılabilir. Atanmış öğrenci sayısı oda kapasitesini "
        "geçerse warning gösterilir.",
        kind="warning"))
    story.append(Spacer(1, 6))

    story.append(PhaseCard(
        "3.5", "Adım 4 — Önizleme ve onay", "/exams/new (Step 4/4)",
        "T-2 · 1 dk",
        "Tüm meta veri, session listesi, atanmış öğrenci sayısı tek "
        "ekranda özetlenir. <b>“Create exam”</b> butonu basılınca sınav "
        "<i>draft</i> statüsünde kaydedilir, otomatik olarak "
        "<font face='MonoTR' size='8.5'>/exams/[id]</font> detayına "
        "yönlendirir.",
        kind="warning"))

    story.append(Spacer(1, 8))
    story.append(Callout(
        "Sınav günü yaklaştıkça otomatik geçişler",
        "<b>Draft → Scheduled:</b> tarih T-1 olduğunda otomatik. "
        "<b>Scheduled → In Progress:</b> session başlangıç saatinin 15 "
        "dakika öncesinde &mdash; bu noktada <b>Live Monitor</b> butonu "
        "aktifleşir. <b>In Progress → Completed:</b> session süresi "
        "dolduğunda. Tüm geçişler audit log'a yazılır.",
        kind="info"))

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════
    # SAYFA 6 — FAZ 4: SINAV GÜNÜ — CANLI GÖZETIM (KRİTİK SAYFA)
    # ════════════════════════════════════════════════════════════
    story.append(SectionHeader(
        5, "FAZ 4 — Sınav Günü: Canlı Gözetmen Paneli",
        "Sınav günü gerçek zamanlı · En kritik faz"))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "Bu faz <b>HorusEye'ın varlık nedenidir</b>. Tüm önceki adımlar "
        "burada gözetmenin paneline akan veriyi anlamlı kılmak içindi. "
        "Aşağıdaki ekran sınav süresince gözetmenin önünde açık kalır.",
        styles["Body"]))

    story.append(Spacer(1, 4))
    story.append(PhaseCard(
        "4.1", "Sınav detayından canlı izlemeye geçiş",
        "/exams/[id]", "T-0 · session-15dk",
        "Session card üzerindeki <b>“Live Monitor”</b> butonu sınav "
        "saatinden 15 dk önce aktifleşir. Tıklandığında /live alt "
        "rotasına gider. AI servisi (FastAPI on-prem) bu noktada "
        "WebSocket bağlantısını kabul etmeye hazırdır.",
        kind="primary"))

    story.append(Spacer(1, 8))
    story.append(Paragraph("Gözetmen paneli — anatomi", styles["H4"]))
    story.append(LiveMonitorMock())
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "<b>Üst şerit:</b> Sınav adı + <i>connection state pill</i> "
        "(Idle → Connecting → Live → Closed). &nbsp;&nbsp;"
        "<b>Sol blok (büyük):</b> Kamera grid — her kamera için canlı "
        "frame + bbox overlay + severity ring. Tıklandığında o kamera "
        "fullscreen olur. &nbsp;&nbsp;"
        "<b>Sağ blok:</b> Incident feed — WebSocket üzerinden gelen "
        "her incident bir kart olarak yukarıya eklenir (severity stripe + "
        "evidence thumbnail + zaman + öğrenci adı varsa).",
        styles["BodyTight"]))

    story.append(Spacer(1, 8))
    story.append(Paragraph("Gözetmenin bu sayfada yapacakları", styles["H4"]))
    for it in [
        "Sınav başlamadan 15 dk önce paneli aç, connection pill'in "
        "<b>Live</b>'a döndüğünü doğrula.",
        "Her kameranın frame'inin geldiğini ve öğrencilerin bbox ile "
        "etiketlendiğini gör.",
        "Sınav süresince incident feed'i izle — yüksek severity (red) "
        "olaylarda kamera kutusu kırmızı ring ile yanar.",
        "Bir incident'a tıkla → modal açılır, evidence JPEG'i ve öğrenci "
        "kimliği görünür. Gerekirse not düş (notes alanı).",
        "Bir öğrenci sınavı erken bitirirse → öğrenci listesinden "
        "<b>“Checkout”</b> bas; o öğrenci için sonraki empty_seat "
        "incident'ları üretilmez.",
        "Bir telefon kamerası eklenecekse → <b>Pair</b> butonu QR kod "
        "açar (cam-pair akışı). Telefon QR'ı okur, otomatik bağlanır.",
    ]:
        story.append(Paragraph(f"•&nbsp;&nbsp;{it}", styles["Bullet"]))

    story.append(Spacer(1, 8))
    story.append(Callout(
        "Kritik prensip",
        "Bu panel <b>karar vermez</b>. Bir incident görünmesi öğrencinin "
        "kopya çektiği anlamına gelmez — sadece kuralın tetiklendiğini "
        "söyler. Gözetmen kararı her zaman <i>kanıt + bağlam + insan "
        "yargı</i> üçlüsüyle verir. Tüm tıklamalar audit log'a yazılır.",
        kind="danger"))

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════
    # SAYFA 7 — FAZ 5: SINAV SONRASI İNCELEME
    # ════════════════════════════════════════════════════════════
    story.append(SectionHeader(
        6, "FAZ 5 — Sınav Sonrası İnceleme ve Raporlama",
        "Sınavdan 1-3 gün sonra · Süre: 30-60 dakika/sınav"))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "Sınav süresi bitip session <i>completed</i> statüsüne geçtiğinde "
        "üretilen tüm incident'lar, evidence görüntüleri ve track verileri "
        "kalıcı olarak Supabase'e yazılmıştır. Gözetmen şimdi sakin "
        "kafayla her olayı yeniden değerlendirir.",
        styles["Body"]))

    story.append(Spacer(1, 4))
    story.append(PhaseCard(
        "5.1", "Incident kuyruğu", "/exams/[id]/incidents", "T+1 · 20 dk",
        "Sınav süresince üretilen tüm incident'ların liste görünümü. "
        "Filter: severity, type, öğrenci, kamera, zaman aralığı. Her "
        "satırda evidence JPEG thumbnail + kuralın hangi pencerede "
        "tetiklendiği. Henüz karara bağlanmamış olaylar üstte.",
        kind="success"))
    story.append(Spacer(1, 6))

    story.append(PhaseCard(
        "5.2", "Post-exam review — karar workflow'u",
        "/exams/[id]/review", "T+1 · 30 dk",
        "Her incident için üç seçenek: <b>clean</b> (yanlış pozitif), "
        "<b>suspicious</b> (kayıt altına al ama aksiyon yok), "
        "<b>violation</b> (rapora geç, öğrenci işlemine başla). "
        "Karar verilen incident öğrencinin profilindeki <i>history</i>'ye "
        "düşer.",
        kind="success"))
    story.append(Spacer(1, 6))

    story.append(PhaseCard(
        "5.3", "PDF raporu üretimi", "/reports/[id]", "T+2 · 5 dk",
        "Sınav bittikten sonra otomatik bir <i>draft report</i> oluşur. "
        "Gözetmen review aşamasındaki kararları onayladığında final "
        "PDF üretilir: öğrenci-bazlı özet, suspicion score, incident "
        "kanıtları (thumbnail), gözetmen notları, audit trail.",
        kind="success"))
    story.append(Spacer(1, 6))

    story.append(PhaseCard(
        "5.4", "Çapraz sınav analitiği", "/exams/analytics", "T+3 · 10 dk",
        "Birden fazla sınav arasında karşılaştırma: hangi davranış tipi "
        "dominant, hangi sınıfta false-positive oranı yüksek, hangi "
        "saatlerde incident yoğunluğu artıyor. Dataset/threshold "
        "ayarlamaları için temel girdi.",
        kind="success"))

    story.append(Spacer(1, 8))
    story.append(Callout(
        "Veri saklama politikası (KVKK)",
        "Evidence JPEG'leri ve track verileri sınav günü "
        "<b>+30 gün</b> saklanır. Sonra otomatik silinir "
        "(Supabase Storage lifecycle policy). Yüz embedding'leri sadece "
        "aktif sınav süresince RAM'de tutulur, persist edilmez. "
        "Sadece <i>karara bağlanmış violation</i> kayıtları öğrenci "
        "profilinde uzun süreli kalır — bu da yargı süreci için "
        "gereklidir.",
        kind="info"))

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════
    # SAYFA 8 — BEKLENMEDİK DURUMLAR (DECISION TREE)
    # ════════════════════════════════════════════════════════════
    story.append(SectionHeader(
        7, "Beklenmedik Durumlar — Karar Ağacı",
        "Sınav sırasında bir şey ters giderse"))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "Aşağıdaki durumlar saha denemeleri sırasında karşılaşılmıştır. "
        "Her birinin standart yanıtı vardır.",
        styles["Body"]))
    story.append(Spacer(1, 6))

    story.append(DecisionBox([
        ("AI servisi bağlantısı koparsa (connection pill kırmızı)",
         "Panelin sağ üst köşesindeki Reconnect butonuna bas. 30sn "
         "içinde gelmezse manuel gözetim devreye girer.",
         "Önceki incident'lar Postgres'te kalır. Boşlukta üretilen "
         "olaylar kaybolur ama persist edilen kayıtlar bozulmaz.",
         "danger"),
        ("Bir kamera frame göndermiyor (kamera kutusu siyah)",
         "Kameranın RTSP adresini /exam-rooms'tan kontrol et. "
         "Phone-paired ise telefonun batarya/wifi durumunu sor.",
         "Diğer kameralar etkilenmez. AI servisi sağlıklı "
         "kameralardan analize devam eder.",
         "warning"),
        ("Bir incident görünüyor ama açıkça yanlış pozitif (örn. "
         "öğrenci kalem alıyor → empty_seat)",
         "Olayı not ile işaretle, sınav sonrası /exams/[id]/review "
         "ekranında 'clean' kararı ver.",
         "Dataset/threshold iyileştirmesi için Cam Overlap modülünde "
         "bu öğrencinin örneği analiz edilir.",
         "info"),
        ("Öğrenci ayağa kalktı ve geri dönmüyor (empty_seat HIGH)",
         "Öncelikle gerçek dünyada bak — wc / soru sorma. Gerekirse "
         "Checkout butonu ile öğrenciyi 'sınavı bitirdi' işaretle.",
         "Sonraki empty_seat'ler bu öğrenci için üretilmez. Süre "
         "raporunda 'erken çıktı' notu görünür.",
         "warning"),
        ("Sistem aşırı sayıda alert üretiyor (>10/dk)",
         "Severity filter'ını 'HIGH veya üstü'ne ayarla. Sınav "
         "sonrası threshold'ları yeniden ayarla.",
         "Düşük severity olaylar log'da kalır, gözden kaçmaz; "
         "ama aktif alert vermez.",
         "info"),
        ("Sınav bitti ama review aşaması tamamlanmadı",
         "Rapor üretimi 7 gün ertelenebilir. /exams/[id]/review "
         "ekranı erişilebilir kalır.",
         "Sistem otomatik hatırlatma gönderir. 30 gün sonra incident "
         "evidence'ları silinir, gözden geçirme şansı kaybolur.",
         "danger"),
    ]))

    story.append(PageBreak())

    # ════════════════════════════════════════════════════════════
    # SAYFA 9 — KONTROL LİSTESİ + SUNUM KONUŞMA NOTLARI
    # ════════════════════════════════════════════════════════════
    story.append(SectionHeader(
        8, "Gözetmen Kontrol Listesi",
        "Sınav gününde unutmaman gerekenler"))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Sınavdan 1 gün önce", styles["H3"]))
    for c_text in [
        "Faz 2'de oda ve öğrenci listesinin güncel olduğunu doğrula",
        "Faz 3'te oluşturduğun sınavın <i>Scheduled</i> statüsünde olduğunu gör",
        "AI servisi staging'te <i>healthy</i> raporluyor "
        "(/dev/monitor sayfası ya da Slack alert kanalı)",
        "Bağlanılacak fiziksel kameraların IP/RTSP adresleri /exam-rooms'ta kayıtlı",
    ]:
        story.append(Paragraph(f"☐&nbsp;&nbsp;{c_text}", styles["Bullet"]))

    story.append(Paragraph("Sınav günü — başlamadan 15 dk önce", styles["H3"]))
    for c_text in [
        "<font face='MonoTR' size='9'>/exams/[id]/live</font> ekranını aç",
        "Connection pill 'Live'a döndü ve tüm kameralar frame gönderiyor",
        "Öğrenci listesi panelin altında görünüyor — sayı doğru mu?",
        "Telefon kamerası eklenecekse Pair butonuyla QR akışını test et",
        "Tarayıcının uyku/screensaver moduna girmemesi için 'Always on' ayarı",
    ]:
        story.append(Paragraph(f"☐&nbsp;&nbsp;{c_text}", styles["Bullet"]))

    story.append(Paragraph("Sınav süresince", styles["H3"]))
    for c_text in [
        "Incident feed'i en az 5 dakikada bir gözle tara",
        "HIGH/CRITICAL severity olaylarda kamera kutusuna tıkla, kanıtı incele",
        "Öğrenci erken çıkışında Checkout butonu kullan — empty_seat alarmlarını engeller",
        "Sınav süresinin bitimine 10 dk kala sayfayı yenileme; arka planda akış sürer",
    ]:
        story.append(Paragraph(f"☐&nbsp;&nbsp;{c_text}", styles["Bullet"]))

    story.append(Paragraph("Sınavdan sonra (3 gün içinde)", styles["H3"]))
    for c_text in [
        "<font face='MonoTR' size='9'>/exams/[id]/incidents</font> "
        "&mdash; tüm incident'ları gözden geçir",
        "<font face='MonoTR' size='9'>/exams/[id]/review</font> "
        "&mdash; her olay için karar (clean/suspicious/violation) ver",
        "PDF raporu üret ve ders koordinatörüyle paylaş",
        "Tekrarlayan false-positive pattern'lerini Datasets modülünde flag'le",
    ]:
        story.append(Paragraph(f"☐&nbsp;&nbsp;{c_text}", styles["Bullet"]))

    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=0.6, color=BORDER))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Demo Day jürisine bu dokümanla nasıl anlatılır",
                           styles["H3"]))
    story.append(Callout(
        "3 cümlelik özet (jüri posterin önüne geldiğinde)",
        "“Gözetmen sisteme girer, odaları ve öğrencileri bir kez tanımlar, "
        "sonra her sınav için 10 dakikalık bir wizard ile setup'ı bitirir. "
        "Sınav günü tek bir ekran açar — <b>/exams/[id]/live</b> — ve AI "
        "kameralardan gelen olayları gerçek zamanlı önüne düşürür. "
        "Sınavdan sonra her olayı clean/suspicious/violation olarak işaretler, "
        "sistem rapora çevirir.”",
        kind="purple"))

    story.append(Spacer(1, 14))
    story.append(Paragraph(
        "<i>Bu doküman 2026-05-15 tarihindeki kod tabanından "
        "(<b>develop</b> dalı, Sprint 14-18 kapanmış) türetilmiştir. "
        "Route'lar <font face='MonoTR' size='8.5'>portal/constants/routes.ts</font> "
        "ve sidebar konfigürasyonu "
        "<font face='MonoTR' size='8.5'>portal/components/layout/Sidebar.tsx</font> "
        "ile birebir uyumludur.</i>",
        styles["Caption"]))

    return story


def main():
    out = os.path.join(SCRIPT_DIR, "HorusEye-Proctor-Workflow.pdf")
    doc = SimpleDocTemplate(
        out,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=1.7 * cm,
        bottomMargin=1.9 * cm,
        title="HorusEye — Uçtan Uca Gözetmen Süreç Dokümanı",
        author="HorusEye Team",
        subject="End-to-end proctor workflow reference (A4)",
    )
    doc.build(build_story(), onFirstPage=add_page_number,
              onLaterPages=add_page_number)
    size_kb = os.path.getsize(out) / 1024
    print(f"OK → {out}  ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
