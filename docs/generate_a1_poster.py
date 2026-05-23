#!/usr/bin/env python3
"""HorusEye — A1 Poster (594 × 841 mm, portrait, light mode).

Print-ready poster. Two placeholders are left for the user to fill in:
- TED University logo (top-left)
- App usage screenshots (right column, 3 slots)

Everything else is designed and drawn here.

Run::

    python3 generate_a1_poster.py
"""

from __future__ import annotations

import os
from datetime import date

from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# ── A1 dimensions (portrait) ──
W, H = 594 * mm, 841 * mm
M = 22 * mm                # outer margin

# ── Türkçe-uyumlu fontlar (macOS Arial) ──
ARIAL = "/System/Library/Fonts/Supplemental/Arial.ttf"
ARIAL_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
ARIAL_BLACK = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
ARIAL_ITALIC = "/System/Library/Fonts/Supplemental/Arial Italic.ttf"
ARIAL_BI = "/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf"
MONO = "/System/Library/Fonts/Supplemental/Courier New.ttf"
MONO_BOLD = "/System/Library/Fonts/Supplemental/Courier New Bold.ttf"

pdfmetrics.registerFont(TTFont("Arial", ARIAL))
pdfmetrics.registerFont(TTFont("Arial-Bold", ARIAL_BOLD))
pdfmetrics.registerFont(TTFont("Arial-Black", ARIAL_BLACK))
pdfmetrics.registerFont(TTFont("Arial-Italic", ARIAL_ITALIC))
pdfmetrics.registerFont(TTFont("Arial-BoldItalic", ARIAL_BI))
pdfmetrics.registerFont(TTFont("Mono", MONO))
pdfmetrics.registerFont(TTFont("Mono-Bold", MONO_BOLD))
registerFontFamily("Arial", normal="Arial", bold="Arial-Bold",
                   italic="Arial-Italic", boldItalic="Arial-BoldItalic")

# ── Marka paleti (light mode) ──
PRIMARY = HexColor("#c0392b")
PRIMARY_DARK = HexColor("#8c2a1f")
PRIMARY_BG = HexColor("#fdf2f0")
PRIMARY_TINT = HexColor("#f9d8d2")

INK = HexColor("#0f172a")
TEXT = HexColor("#1e293b")
MUTED = HexColor("#475569")
LIGHT = HexColor("#94a3b8")
BORDER = HexColor("#cbd5e1")
LIGHT_BG = HexColor("#f8fafc")
PAPER = HexColor("#ffffff")

INFO = HexColor("#0369a1")
INFO_BG = HexColor("#eff6ff")
SUCCESS = HexColor("#15803d")
SUCCESS_BG = HexColor("#ecfdf5")
WARN = HexColor("#b45309")
WARN_BG = HexColor("#fef3c7")
DANGER = HexColor("#991b1b")
SEVERITY = {
    "low": HexColor("#1d4ed8"),
    "medium": HexColor("#b45309"),
    "high": HexColor("#b91c1c"),
    "critical": HexColor("#7f1d1d"),
}


# ════════════════════════════════════════════════════════════════
# Drawing helpers
# ════════════════════════════════════════════════════════════════

def wrap_text(c, text, font, size, max_w):
    """Greedy word-wrap returning a list of fitted lines."""
    c.setFont(font, size)
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if c.stringWidth(trial, font, size) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def draw_text(c, text, x, y, font="Arial", size=11, color=TEXT,
              align="left", leading=None, max_w=None):
    c.setFont(font, size)
    c.setFillColor(color)
    if max_w is None:
        if align == "center":
            c.drawCentredString(x, y, text)
        elif align == "right":
            c.drawRightString(x, y, text)
        else:
            c.drawString(x, y, text)
        return y - (leading or size * 1.2)

    lead = leading or size * 1.25
    lines = wrap_text(c, text, font, size, max_w)
    cy = y
    for line in lines:
        if align == "center":
            c.drawCentredString(x + max_w / 2, cy, line)
        elif align == "right":
            c.drawRightString(x + max_w, cy, line)
        else:
            c.drawString(x, cy, line)
        cy -= lead
    return cy


def rounded_card(c, x, y, w, h, *, fill=PAPER, stroke=BORDER, lw=0.5,
                 radius=4 * mm):
    if fill is not None:
        c.setFillColor(fill)
    if stroke is not None:
        c.setStrokeColor(stroke)
    c.setLineWidth(lw)
    c.roundRect(x, y, w, h,
                radius,
                fill=1 if fill is not None else 0,
                stroke=1 if stroke is not None else 0)


def stripe_card(c, x, y, w, h, *, fill, stripe, radius=4 * mm,
                stripe_w=2.2 * mm):
    rounded_card(c, x, y, w, h, fill=fill, stroke=None, radius=radius)
    c.setFillColor(stripe)
    c.rect(x, y, stripe_w, h, fill=1, stroke=0)


def section_title(c, x, y, text, *, color=PRIMARY_DARK, size=22, w=None):
    """Bold section heading with under-rule."""
    c.setFont("Arial-Bold", size)
    c.setFillColor(color)
    c.drawString(x, y, text)
    if w is None:
        w = c.stringWidth(text, "Arial-Bold", size)
    c.setStrokeColor(color)
    c.setLineWidth(1.4)
    c.line(x, y - 3 * mm, x + w, y - 3 * mm)


def draw_bullet_list(c, x, y, items, *, w, size=11, leading=15,
                     dot_color=PRIMARY, text_color=TEXT, bold_first_word=False):
    """Returns the y after the last line."""
    cy = y
    for item in items:
        # bullet dot
        c.setFillColor(dot_color)
        c.circle(x + 1.6 * mm, cy + size * 0.35, 0.9 * mm, fill=1, stroke=0)
        # text
        text_x = x + 5 * mm
        text_w = w - 5 * mm
        c.setFillColor(text_color)
        if bold_first_word and ":" in item:
            head, tail = item.split(":", 1)
            head = head + ":"
            c.setFont("Arial-Bold", size)
            head_w = c.stringWidth(head + " ", "Arial-Bold", size)
            c.drawString(text_x, cy, head)
            rest_lines = wrap_text(c, tail.strip(), "Arial", size,
                                   text_w - head_w)
            if rest_lines:
                c.setFont("Arial", size)
                c.drawString(text_x + head_w, cy, rest_lines[0])
                cy -= leading
                for r in rest_lines[1:]:
                    c.drawString(text_x, cy, r)
                    cy -= leading
            else:
                cy -= leading
        else:
            lines = wrap_text(c, item, "Arial", size, text_w)
            for ln in lines:
                c.setFont("Arial", size)
                c.drawString(text_x, cy, ln)
                cy -= leading
        cy -= 3
    return cy


# ════════════════════════════════════════════════════════════════
# Top sections
# ════════════════════════════════════════════════════════════════

def draw_top_strip(c):
    """Title strip — 100 mm tall, full-width."""
    top = H - M
    strip_h = 105 * mm
    y0 = top - strip_h

    # Background
    rounded_card(c, M, y0, W - 2 * M, strip_h,
                 fill=PRIMARY_BG, stroke=PRIMARY_TINT, lw=0.7,
                 radius=6 * mm)

    # Left: TED University logo placeholder
    logo_w = 60 * mm
    logo_h = 60 * mm
    logo_x = M + 8 * mm
    logo_y = y0 + (strip_h - logo_h) / 2
    placeholder(c, logo_x, logo_y, logo_w, logo_h,
                title="TED ÜNİVERSİTESİ",
                subtitle="logo görseli buraya",
                aspect="square")

    # Center: HorusEye wordmark + title
    cx = W / 2
    # Mini eye glyph
    eye_cy = top - 30 * mm
    c.setFillColor(PRIMARY)
    c.ellipse(cx - 26 * mm, eye_cy - 9 * mm, cx + 26 * mm, eye_cy + 9 * mm,
              fill=1, stroke=0)
    c.setFillColor(white)
    c.circle(cx, eye_cy, 7 * mm, fill=1, stroke=0)
    c.setFillColor(PRIMARY_DARK)
    c.circle(cx, eye_cy, 3 * mm, fill=1, stroke=0)

    # Wordmark
    c.setFont("Arial-Black", 60)
    c.setFillColor(PRIMARY)
    horus_w = c.stringWidth("horus", "Arial-Black", 60)
    c.setFont("Arial", 60)
    eye_w = c.stringWidth("eye", "Arial", 60)
    total_w = horus_w + eye_w + 4 * mm
    start_x = cx - total_w / 2

    c.setFont("Arial-Black", 60)
    c.setFillColor(PRIMARY)
    c.drawString(start_x, eye_cy - 30 * mm, "horus")
    c.setFont("Arial", 60)
    c.setFillColor(LIGHT)
    c.drawString(start_x + horus_w + 4 * mm, eye_cy - 30 * mm, "eye")

    # Subtitle
    c.setFont("Arial-Italic", 18)
    c.setFillColor(MUTED)
    c.drawCentredString(cx, eye_cy - 44 * mm,
                        "AI-Based Exam Proctoring & Monitoring System")

    # Right: course & date stack
    rx = W - M - 8 * mm
    cy_r = top - 22 * mm

    c.setFont("Arial-Bold", 15)
    c.setFillColor(PRIMARY_DARK)
    c.drawRightString(rx, cy_r, "TED UNIVERSITY")
    cy_r -= 6.5 * mm

    c.setFont("Arial", 12)
    c.setFillColor(TEXT)
    c.drawRightString(rx, cy_r, "Department of Computer Engineering")
    cy_r -= 7 * mm

    c.setFont("Arial-Bold", 14)
    c.setFillColor(PRIMARY)
    c.drawRightString(rx, cy_r, "CMPE 491 / 492")
    cy_r -= 6 * mm

    c.setFont("Arial", 11)
    c.setFillColor(MUTED)
    c.drawRightString(rx, cy_r, "Senior Design Project")
    cy_r -= 6 * mm

    c.setFont("Arial", 11)
    c.setFillColor(MUTED)
    c.drawRightString(rx, cy_r, "Spring 2026")

    return y0


def draw_slogan_band(c, y_top):
    """Big tagline band — 30 mm tall."""
    h = 30 * mm
    y = y_top - 6 * mm - h
    rounded_card(c, M, y, W - 2 * M, h,
                 fill=PRIMARY, stroke=None, radius=3 * mm)
    c.setFillColor(white)
    c.setFont("Arial-Black", 34)
    c.drawCentredString(W / 2, y + h / 2 + 2 * mm,
                        "Detects.  Explains.  Never decides.")
    c.setFont("Arial-Italic", 12.5)
    c.setFillColor(HexColor("#fce8e3"))
    c.drawCentredString(W / 2, y + 7 * mm,
                        "Detects 17 incident behaviours  ·  "
                        "Explains every alert with rule + evidence  ·  "
                        "Defers the final verdict to the human proctor")
    return y


# ════════════════════════════════════════════════════════════════
# Three-column body
# ════════════════════════════════════════════════════════════════

def draw_three_columns(c, y_top, y_bottom):
    """Left / Center / Right columns. Returns final y."""
    avail_w = W - 2 * M
    gap = 7 * mm
    col_w = (avail_w - 2 * gap) / 3
    col_h = y_top - y_bottom

    # Backgrounds
    rounded_card(c, M, y_bottom, col_w, col_h,
                 fill=INFO_BG, stroke=None, radius=3 * mm)
    rounded_card(c, M + col_w + gap, y_bottom, col_w, col_h,
                 fill=LIGHT_BG, stroke=None, radius=3 * mm)
    rounded_card(c, M + 2 * (col_w + gap), y_bottom, col_w, col_h,
                 fill=SUCCESS_BG, stroke=None, radius=3 * mm)

    # — LEFT COLUMN
    lx = M + 6 * mm
    ly = y_top - 12 * mm
    section_title(c, lx, ly, "THE PROBLEM", color=INFO, size=19)
    ly -= 12 * mm
    ly = draw_text(c,
        "Conventional in-person exams place one proctor in front of "
        "30+ students. Humans cannot sustain reliable attention for "
        "short, localised cheating attempts — a glance at a neighbour, "
        "a phone briefly produced, a whispered exchange.",
        lx, ly, font="Arial", size=12.5, color=TEXT,
        leading=16, max_w=col_w - 12 * mm)
    ly -= 4 * mm

    ly = draw_text(c,
        "Post-exam video review takes longer than the exam itself, "
        "and proctors who suspect an incident often cannot produce "
        "the timestamped evidence required by academic-integrity boards.",
        lx, ly, font="Arial", size=12.5, color=TEXT,
        leading=16, max_w=col_w - 12 * mm)
    ly -= 6 * mm

    section_title(c, lx, ly, "OUR APPROACH", color=INFO, size=19)
    ly -= 12 * mm
    approach = [
        "Real-time AI assistant: not a replacement for the proctor.",
        "Multi-signal fusion: object detection + tracking + gaze + pose + identity.",
        "Every alert is explainable: rules and evidence shown to the human.",
        "Decision authority remains with the proctor: clean / suspicious / violation.",
        "CPU-only inference — no GPU required; ~$60/month cloud cost.",
        "KVKK / GDPR-compliant: minimal retention, consent at sign-in.",
    ]
    ly = draw_bullet_list(c, lx, ly, approach,
                          w=col_w - 12 * mm,
                          size=12, leading=15,
                          dot_color=INFO, text_color=TEXT)
    ly -= 4 * mm

    section_title(c, lx, ly, "KEY FEATURES", color=INFO, size=19)
    ly -= 12 * mm
    features = [
        "Multi-step exam wizard with room, camera and student assignment",
        "Live monitor with per-track incident ring + bbox overlay",
        "Post-exam review with clean / suspicious / violation modal",
        "Multi-camera + telephone-as-camera support",
        "PDF report per exam, session and student",
        "Sprint platform with PRD-linked backlog (PRD-018)",
    ]
    ly = draw_bullet_list(c, lx, ly, features,
                          w=col_w - 12 * mm,
                          size=11.5, leading=14,
                          dot_color=INFO, text_color=TEXT)

    # — CENTER COLUMN
    mx = M + col_w + gap + 6 * mm
    my = y_top - 12 * mm
    inner_w = col_w - 12 * mm
    section_title(c, mx, my, "SYSTEM ARCHITECTURE", size=19)
    my -= 14 * mm
    my = draw_architecture(c, mx, my, inner_w)
    my -= 6 * mm

    section_title(c, mx, my, "BY THE NUMBERS", size=19)
    my -= 14 * mm
    my = draw_stat_tiles(c, mx, my, inner_w)
    my -= 6 * mm

    section_title(c, mx, my, "SPRINT TIMELINE", size=19)
    my -= 14 * mm
    my = draw_sprint_timeline(c, mx, my, inner_w)
    my -= 8 * mm

    section_title(c, mx, my, "ENGINEERING DISCIPLINE", size=19)
    my -= 14 * mm
    my = draw_engineering_box(c, mx, my, inner_w)

    # — RIGHT COLUMN
    rx = M + 2 * (col_w + gap) + 6 * mm
    ry = y_top - 12 * mm
    section_title(c, rx, ry, "AI PIPELINE", color=SUCCESS, size=19)
    ry -= 12 * mm
    ry = draw_ai_pipeline(c, rx, ry, col_w - 12 * mm)
    ry -= 4 * mm

    section_title(c, rx, ry, "17 BEHAVIOURS DETECTED",
                  color=SUCCESS, size=19)
    ry -= 12 * mm
    ry = draw_behaviour_chips(c, rx, ry, col_w - 12 * mm)
    ry -= 4 * mm

    section_title(c, rx, ry, "APP IN USE", color=SUCCESS, size=19)
    ry -= 12 * mm
    ry = draw_app_screenshots(c, rx, ry, col_w - 12 * mm)

    # Use the actual bottom of the columns for return value
    return y_bottom


def draw_architecture(c, x, y, w):
    """Architecture diagram — 4-layer stack."""
    layers = [
        ("CAMERAS", "IP / Phone / Webcam", PRIMARY_BG, PRIMARY_DARK),
        ("AI SERVICE  (FastAPI · Python 3.12)",
         "YOLOv8n  ·  BoT-SORT  ·  MediaPipe  ·  ArcFace  ·  16 Rules",
         HexColor("#fef3c7"), HexColor("#92400e")),
        ("PORTAL  (Next.js 16 · React 19)",
         "Auth · Live Monitor · Review · Reports · Sprint Board",
         HexColor("#dbeafe"), HexColor("#1e40af")),
        ("DATA  (Supabase · Postgres 17 · pgvector)",
         "RLS  ·  Audit  ·  Storage  ·  53 migrations",
         HexColor("#dcfce7"), HexColor("#166534")),
    ]
    box_h = 17 * mm
    gap_v = 3 * mm
    arrow_h = 4 * mm

    cy = y
    for title, sub, bg, fg in layers:
        rounded_card(c, x, cy - box_h, w, box_h, fill=bg, stroke=BORDER,
                     lw=0.5, radius=2.5 * mm)
        c.setFont("Arial-Bold", 11.5)
        c.setFillColor(fg)
        c.drawCentredString(x + w / 2, cy - 7 * mm, title)
        c.setFont("Arial", 9.5)
        c.setFillColor(TEXT)
        c.drawCentredString(x + w / 2, cy - 13 * mm, sub)
        cy -= box_h
        # Arrow
        c.setStrokeColor(LIGHT)
        c.setLineWidth(1)
        ax = x + w / 2
        c.line(ax, cy, ax, cy - gap_v + 0.5 * mm)
        # Arrowhead
        c.setFillColor(LIGHT)
        p = c.beginPath()
        p.moveTo(ax - 1.5 * mm, cy - gap_v + 0.5 * mm)
        p.lineTo(ax + 1.5 * mm, cy - gap_v + 0.5 * mm)
        p.lineTo(ax, cy - gap_v - 2.5 * mm)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
        cy -= gap_v + 1.5 * mm

    cy += gap_v + 1.5 * mm
    # Right caption
    c.setFont("Arial-Italic", 9)
    c.setFillColor(MUTED)
    c.drawCentredString(x + w / 2, cy - 5.5 * mm,
        "Two services on AWS ECS Fargate behind separate ALBs · "
        "WebSocket protocol v1.1")
    return cy - 8 * mm


def draw_stat_tiles(c, x, y, w):
    """Two rows of stat tiles."""
    tiles = [
        ("22", "PRD docs"),
        ("18", "sprints"),
        ("17", "behaviours"),
        ("53", "migrations"),
        ("93", "API routes"),
        ("77", "tests"),
        ("16", "AI rules"),
        ("4", "AWS stacks"),
    ]
    cols = 4
    gap = 3 * mm
    tw = (w - (cols - 1) * gap) / cols
    th = 19 * mm
    cy = y
    for row in range(2):
        for i in range(cols):
            big, label = tiles[row * cols + i]
            tx = x + i * (tw + gap)
            rounded_card(c, tx, cy - th, tw, th,
                         fill=white, stroke=PRIMARY_TINT, lw=0.6,
                         radius=2 * mm)
            c.setFont("Arial-Black", 22)
            c.setFillColor(PRIMARY)
            c.drawCentredString(tx + tw / 2, cy - 11 * mm, big)
            c.setFont("Arial", 9)
            c.setFillColor(MUTED)
            c.drawCentredString(tx + tw / 2, cy - 16 * mm, label)
        cy -= th + gap
    return cy


def draw_sprint_timeline(c, x, y, w):
    """Horizontal sprint timeline."""
    sprints = [
        ("S1-6", "Foundation\n+ Phase A"),
        ("S7", "Tracking\n+ phone"),
        ("S8", "Gaze\n+ head"),
        ("S9", "TIER-1\ncomplete"),
        ("S10", "ArcFace\nidentity"),
        ("S11", "Risk\nmodel"),
        ("S12", "Post-exam\nreview"),
        ("S13", "Reliability"),
        ("S14-16", "Dataset\n+ YOLO ft"),
        ("S17-18", "Multi-cam\n+ pose"),
    ]
    n = len(sprints)
    h = 22 * mm
    # Connector line
    cy = y - h / 2
    c.setStrokeColor(PRIMARY_TINT)
    c.setLineWidth(2)
    c.line(x + 4 * mm, cy, x + w - 4 * mm, cy)

    step = (w - 8 * mm) / (n - 1)
    for i, (code, lbl) in enumerate(sprints):
        cx = x + 4 * mm + i * step
        # node
        c.setFillColor(PRIMARY)
        c.circle(cx, cy, 2.2 * mm, fill=1, stroke=0)
        # code
        c.setFont("Arial-Bold", 9)
        c.setFillColor(PRIMARY_DARK)
        c.drawCentredString(cx, cy + 4.5 * mm, code)
        # label (2 lines)
        c.setFont("Arial", 7.8)
        c.setFillColor(TEXT)
        lines = lbl.split("\n")
        ny = cy - 6 * mm
        for ln in lines:
            c.drawCentredString(cx, ny, ln)
            ny -= 3.2 * mm
    return y - h - 2 * mm


def draw_ai_pipeline(c, x, y, w):
    """Inference pipeline horizontal flow."""
    steps = [
        ("Frame",      "5 FPS · JPEG"),
        ("YOLOv8n",    "person · phone · book"),
        ("BoT-SORT",   "multi-track + reID"),
        ("MediaPipe",  "FaceMesh · Pose"),
        ("ArcFace",    "512-D embedding"),
        ("Rules × 16", "temporal windows"),
        ("Incident",   "evidence + WS push"),
    ]
    cy = y
    box_h = 13 * mm
    gap_v = 2 * mm
    for i, (title, sub) in enumerate(steps):
        rounded_card(c, x, cy - box_h, w, box_h,
                     fill=white, stroke=SUCCESS, lw=0.6,
                     radius=2 * mm)
        c.setFont("Arial-Bold", 11)
        c.setFillColor(SUCCESS)
        c.drawString(x + 3 * mm, cy - 5.5 * mm, f"{i + 1}.  {title}")
        c.setFont("Arial", 9)
        c.setFillColor(TEXT)
        c.drawString(x + 3 * mm, cy - 10 * mm, sub)
        # arrow tail
        if i < len(steps) - 1:
            c.setFillColor(SUCCESS)
            ax = x + w - 6 * mm
            c.circle(ax, cy - box_h / 2, 1.0 * mm, fill=1, stroke=0)
        cy -= box_h + gap_v
    return cy


def draw_behaviour_chips(c, x, y, w):
    """Tag chips for the 17 incident types."""
    chips = [
        ("phone_in_hand", "high"),
        ("paper_detected", "medium"),
        ("empty_seat", "low"),
        ("unauthorized_person", "critical"),
        ("gaze_diversion", "medium"),
        ("head_turn", "medium"),
        ("hand_to_ear_mouth", "medium"),
        ("hand_under_desk", "medium"),
        ("body_lean_neighbor", "high"),
        ("standing_up", "medium"),
        ("object_passing", "high"),
        ("gaze_at_lap", "medium"),
        ("gaze_at_neighbor", "high"),
        ("synchronized_behavior", "high"),
        ("face_covering", "high"),
        ("position_uncertainty", "low"),
        ("whispering (Phase C)", "low"),
    ]
    cy = y
    cx = x
    chip_h = 7.5 * mm
    pad = 3 * mm
    inter = 2 * mm
    c.setFont("Arial-Bold", 9.5)
    line_top = cy
    for label, sev in chips:
        text = label.replace("_", " ")
        tw = c.stringWidth(text, "Arial-Bold", 9.5)
        cw = tw + 2 * pad + 4 * mm  # extra room for dot
        if cx + cw > x + w:
            cx = x
            cy -= chip_h + 2.2 * mm
        col = SEVERITY[sev]
        rounded_card(c, cx, cy - chip_h, cw, chip_h,
                     fill=PAPER, stroke=col, lw=0.7, radius=3.5 * mm)
        c.setFillColor(col)
        c.circle(cx + pad, cy - chip_h / 2, 1.4 * mm, fill=1, stroke=0)
        c.setFillColor(INK)
        c.drawString(cx + pad + 3.5 * mm, cy - chip_h + 2.5 * mm, text)
        cx += cw + inter
    cy -= chip_h
    # Legend
    cy -= 5 * mm
    c.setFont("Arial-Bold", 9)
    c.setFillColor(MUTED)
    c.drawString(x, cy, "Severity:")
    leg_x = x + 18 * mm
    for sev, col in SEVERITY.items():
        c.setFillColor(col)
        c.circle(leg_x, cy + 1 * mm, 1.4 * mm, fill=1, stroke=0)
        c.setFillColor(TEXT)
        c.setFont("Arial", 9)
        c.drawString(leg_x + 3 * mm, cy, sev)
        leg_x += 22 * mm
    return cy - 4 * mm


def placeholder(c, x, y, w, h, *, title="", subtitle="", aspect=""):
    """Render a placeholder box for user-supplied images."""
    c.setFillColor(HexColor("#f1f5f9"))
    c.setStrokeColor(HexColor("#94a3b8"))
    c.setLineWidth(0.8)
    c.setDash(3, 3)
    c.roundRect(x, y, w, h, 3 * mm, fill=1, stroke=1)
    c.setDash()  # solid back

    # Cross marks
    c.setStrokeColor(HexColor("#cbd5e1"))
    c.setLineWidth(0.5)
    c.line(x + 4 * mm, y + 4 * mm, x + w - 4 * mm, y + h - 4 * mm)
    c.line(x + 4 * mm, y + h - 4 * mm, x + w - 4 * mm, y + 4 * mm)

    # Inner label card
    label_w = min(w - 8 * mm, 60 * mm)
    label_h = 14 * mm
    lx = x + (w - label_w) / 2
    ly = y + (h - label_h) / 2
    rounded_card(c, lx, ly, label_w, label_h, fill=white,
                 stroke=HexColor("#94a3b8"), lw=0.6, radius=2 * mm)
    c.setFont("Arial-Bold", 9.5)
    c.setFillColor(HexColor("#475569"))
    c.drawCentredString(lx + label_w / 2, ly + label_h - 5.5 * mm, title)
    if subtitle:
        c.setFont("Arial-Italic", 8)
        c.setFillColor(LIGHT)
        c.drawCentredString(lx + label_w / 2, ly + 4 * mm, subtitle)


def draw_app_screenshots(c, x, y, w):
    """Four stacked screenshot placeholders."""
    titles = [
        ("LIVE MONITOR", "/exams/[id]/live · bbox overlay + incident ring"),
        ("POST-EXAM REVIEW",
         "/exams/[id]/review · decision modal (clean/suspicious/violation)"),
        ("EXAM CREATION WIZARD",
         "/exams/new · 5-step room + camera + student assignment"),
        ("SPRINT BOARD",
         "/sprints/[id] · PRD-linked backlog + dependencies"),
    ]
    shot_h = 40 * mm
    gap_v = 3.5 * mm
    cy = y
    for title, sub in titles:
        placeholder(c, x, cy - shot_h, w, shot_h,
                    title=title, subtitle=sub)
        cy -= shot_h + gap_v
    return cy


def draw_engineering_box(c, x, y, w):
    """Center column — engineering workflow callout."""
    items = [
        ("22 PRDs, versioned interface contracts",
         "Pre-commit hook blocks drift between PRD-000 and consumer PRDs."),
        ("Sprint backlog with dependency enforcement",
         "Blocker not 'done' prevents dependant from advancing (409 error)."),
        ("Code-review workflow + audit trail",
         "BacklogReview row required before status='done'."),
        ("CI gates: secrets · env-vars · types · tests · build",
         "GitHub Actions runs Supabase migrations BEFORE Docker build."),
        ("Zero-downtime ECS rolling deploys",
         "minHealthyPercent=100 keeps old container until new healthy."),
    ]
    cy = y
    line_h = 12 * mm
    for head, body in items:
        rounded_card(c, x, cy - line_h, w, line_h,
                     fill=PAPER, stroke=PRIMARY_TINT, lw=0.5,
                     radius=2 * mm)
        # icon dot
        c.setFillColor(PRIMARY)
        c.circle(x + 4 * mm, cy - line_h / 2, 1.5 * mm, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Arial-Bold", 9)
        c.drawCentredString(x + 4 * mm, cy - line_h / 2 - 1 * mm, "✓")
        # head
        c.setFont("Arial-Bold", 10.5)
        c.setFillColor(INK)
        c.drawString(x + 9 * mm, cy - 4.5 * mm, head)
        # body
        c.setFont("Arial", 9)
        c.setFillColor(MUTED)
        c.drawString(x + 9 * mm, cy - 9 * mm, body)
        cy -= line_h + 1.5 * mm
    return cy


# ════════════════════════════════════════════════════════════════
# Bottom: tech, ethics, team, QR
# ════════════════════════════════════════════════════════════════

def draw_tech_strip(c, y_bottom):
    """Tech stack rozetleri — full width above ethics box."""
    h = 26 * mm
    y = y_bottom + 1 * mm
    w = W - 2 * M
    rounded_card(c, M, y, w, h, fill=LIGHT_BG, stroke=BORDER, lw=0.5,
                 radius=3 * mm)

    c.setFont("Arial-Bold", 11)
    c.setFillColor(PRIMARY_DARK)
    c.drawString(M + 6 * mm, y + h - 7 * mm, "TECHNOLOGY STACK")

    badges = [
        "Next.js 16", "React 19", "TypeScript", "Tailwind v4",
        "shadcn/ui", "Supabase", "Postgres 17", "pgvector",
        "FastAPI", "Python 3.12", "YOLOv8n", "BoT-SORT",
        "MediaPipe", "InsightFace", "OpenCV", "AWS CDK",
        "ECS Fargate", "ALB", "Route 53", "GitHub Actions",
        "Serwist PWA", "Sentry", "Playwright", "Vitest",
    ]
    c.setFont("Arial", 10.5)
    px = M + 6 * mm
    py = y + h - 16 * mm
    chip_pad_x = 3 * mm
    chip_h = 6.5 * mm
    inter = 2 * mm
    for b in badges:
        tw = c.stringWidth(b, "Arial", 10.5)
        cw = tw + chip_pad_x * 2
        if px + cw > M + w - 6 * mm:
            px = M + 6 * mm
            py -= chip_h + 2 * mm
        rounded_card(c, px, py - chip_h, cw, chip_h,
                     fill=white, stroke=PRIMARY_TINT, lw=0.6,
                     radius=3 * mm)
        c.setFont("Arial", 10.5)
        c.setFillColor(TEXT)
        c.drawString(px + chip_pad_x, py - chip_h + 2 * mm, b)
        px += cw + inter
    return y


def draw_ethics_callout(c, y_top):
    """Social Impact · Ethics · KVKK band — 3-column responsible-design panel."""
    h = 65 * mm
    y = y_top - 2 * mm - h
    w = W - 2 * M
    stripe_card(c, M, y, w, h, fill=WARN_BG, stripe=WARN,
                radius=3 * mm, stripe_w=3.5 * mm)

    # Title
    c.setFont("Arial-Bold", 17)
    c.setFillColor(WARN)
    c.drawString(M + 12 * mm, y + h - 9 * mm,
                 "Social Impact · Ethics · KVKK — "
                 "the system never makes a verdict on its own")

    # Subtitle / principle line
    c.setFont("Arial-Italic", 11)
    c.setFillColor(TEXT)
    c.drawString(M + 12 * mm, y + h - 15 * mm,
                 "Every detected behaviour is a candidate for the human "
                 "proctor — we built HorusEye for fair education, not for "
                 "automated surveillance.")

    # Three columns
    col_left = M + 12 * mm
    col_right_end = M + w - 12 * mm
    col_total = col_right_end - col_left
    col_gap = 6 * mm
    col_w_each = (col_total - 2 * col_gap) / 3

    col1_x = col_left
    col2_x = col_left + col_w_each + col_gap
    col3_x = col_left + 2 * (col_w_each + col_gap)

    header_y = y + h - 23 * mm

    # Headers
    for hx, htext in [
        (col1_x, "WHO BENEFITS"),
        (col2_x, "RESPONSIBLE DESIGN"),
        (col3_x, "PRIVACY & COMPLIANCE"),
    ]:
        c.setFont("Arial-Bold", 11)
        c.setFillColor(DANGER)
        c.drawString(hx, header_y, htext)
        # mini under-rule
        c.setStrokeColor(DANGER)
        c.setLineWidth(0.8)
        head_w = c.stringWidth(htext, "Arial-Bold", 11)
        c.line(hx, header_y - 1.5 * mm, hx + head_w, header_y - 1.5 * mm)

    benefits = [
        "Students — fair, transparent grading",
        "Faculty — relief from attention-fatigue",
        "Institutions — defensible academic-integrity decisions",
        "Society — sustained trust in academic degrees",
    ]
    design = [
        "Human-in-the-loop: proctor decides, AI never issues a verdict",
        "Every alert is explainable (rule + evidence + timestamp)",
        "CPU-only at ~$60/month → affordable for public schools",
        "Open architecture, no vendor lock-in, no proprietary cameras",
    ]
    compliance = [
        "KVKK Madde 11 · GDPR Article 22 reflected in data model",
        "Consent captured at sign-in; revocable at any time",
        "Face embeddings processed only during active session",
        "Incident evidence purged after 30 days",
        "Audit logs append-only — tamper-evident",
    ]

    body_y = header_y - 5 * mm

    def bullets(x, y0, items):
        cy = y0
        for it in items:
            # small filled right-pointing triangle bullet
            c.setFillColor(WARN)
            p = c.beginPath()
            tri_y = cy + 1 * mm
            p.moveTo(x, tri_y)
            p.lineTo(x + 1.7 * mm, tri_y + 0.9 * mm)
            p.lineTo(x, tri_y + 1.8 * mm)
            p.close()
            c.drawPath(p, fill=1, stroke=0)
            c.setFont("Arial", 9)
            c.setFillColor(TEXT)
            lines = wrap_text(c, it, "Arial", 9, col_w_each - 4 * mm)
            for ln in lines:
                c.drawString(x + 3 * mm, cy, ln)
                cy -= 3.6 * mm
            cy -= 0.4 * mm
        return cy

    bullets(col1_x, body_y, benefits)
    bullets(col2_x, body_y, design)
    bullets(col3_x, body_y, compliance)

    # SDG footer line — full-width, prominent italic
    c.setFont("Arial-BoldItalic", 9.5)
    c.setFillColor(WARN)
    c.drawCentredString(
        M + w / 2, y + 4 * mm,
        "Aligned with UN Sustainable Development Goals  ·  "
        "SDG 4 Quality Education  ·  "
        "SDG 10 Reduced Inequalities  ·  "
        "SDG 16 Strong Institutions"
    )
    return y


def draw_footer(c, y_top):
    """Team strip + QR + Supervisor — final band."""
    h = 60 * mm
    y = y_top - 4 * mm - h
    w = W - 2 * M
    rounded_card(c, M, y, w, h, fill=PRIMARY_BG, stroke=None,
                 radius=3 * mm)

    # Section title
    c.setFont("Arial-Bold", 14)
    c.setFillColor(PRIMARY_DARK)
    c.drawString(M + 8 * mm, y + h - 9 * mm, "THE TEAM")

    members = [
        ("Çağla Abazaoğlu",    "Project Coordinator"),
        ("Gizem Nur İpek",     "Portal Backend"),
        ("Taha Kürşat Öztürk", "Product Owner · Full-stack"),
        ("Ali Sahil",          "AI Backend"),
        ("Tuğba Hilal Kırer",  "Portal Frontend"),
    ]
    n = len(members)
    qr_w = 42 * mm
    team_w = w - qr_w - 24 * mm
    avatar_d = 14 * mm
    gap = (team_w - n * (avatar_d + 28 * mm)) / max(n - 1, 1)
    gap = max(gap, 4 * mm)

    bx = M + 8 * mm
    by = y + 14 * mm
    for name, role in members:
        # avatar placeholder circle
        c.setFillColor(PRIMARY)
        c.circle(bx + avatar_d / 2, by + avatar_d / 2,
                 avatar_d / 2, fill=1, stroke=0)
        # initials
        initials = "".join(part[0] for part in name.split()[:2]).upper()
        c.setFont("Arial-Bold", 11)
        c.setFillColor(white)
        c.drawCentredString(bx + avatar_d / 2,
                            by + avatar_d / 2 - 3 * mm, initials)
        # name + role
        c.setFont("Arial-Bold", 11)
        c.setFillColor(INK)
        c.drawString(bx + avatar_d + 3 * mm, by + avatar_d - 4 * mm, name)
        c.setFont("Arial-Italic", 9.5)
        c.setFillColor(MUTED)
        c.drawString(bx + avatar_d + 3 * mm, by + 2 * mm, role)
        bx += avatar_d + 28 * mm + gap

    # Supervisor + coordinator block
    c.setFont("Arial-Bold", 11)
    c.setFillColor(PRIMARY_DARK)
    c.drawString(M + 8 * mm, y + 7 * mm, "Project Supervisor:")
    c.setFont("Arial", 11)
    c.setFillColor(INK)
    c.drawString(M + 50 * mm, y + 7 * mm, "Fırat Akba")

    c.setFont("Arial-Bold", 11)
    c.setFillColor(PRIMARY_DARK)
    c.drawString(M + 8 * mm, y + 2 * mm, "Course Coordinator:")
    c.setFont("Arial", 11)
    c.setFillColor(INK)
    c.drawString(M + 50 * mm, y + 2 * mm, "Gökçe Nur Yılmaz")

    # QR placeholder (right)
    qx = M + w - qr_w - 8 * mm
    qy = y + h - qr_w - 10 * mm
    placeholder(c, qx, qy, qr_w, qr_w,
                title="QR",
                subtitle="horuseye.app")

    # URL strip — centered under QR
    c.setFont("Arial-Bold", 9.5)
    c.setFillColor(PRIMARY_DARK)
    c.drawCentredString(qx + qr_w / 2, qy - 5 * mm,
                        "github.com/kursatozturk/HorusEye")
    c.setFont("Arial", 8.5)
    c.setFillColor(MUTED)
    c.drawCentredString(qx + qr_w / 2, qy - 9 * mm, "horuseye.app")
    return y


def draw_print_marks(c):
    """Tiny print metadata in the corner."""
    c.setFont("Arial-Italic", 7)
    c.setFillColor(LIGHT)
    today = date(2026, 5, 14).strftime("%d %b %Y")
    c.drawString(M, 8 * mm,
                 f"HorusEye Final Poster · v1.0 · {today} · A1 portrait · "
                 "CMYK conversion required before press")
    c.drawRightString(W - M, 8 * mm, "TED University · CMPE 491/492")


# ════════════════════════════════════════════════════════════════
# Compose
# ════════════════════════════════════════════════════════════════

def build_poster():
    out = os.path.join(SCRIPT_DIR, "HorusEye-A1-Poster.pdf")
    c = canvas.Canvas(out, pagesize=(W, H))
    c.setTitle("HorusEye — AI-Based Exam Proctoring System")
    c.setAuthor("HorusEye Team")
    c.setSubject("CMPE 491/492 Senior Project Poster — A1 portrait")

    # Page background (subtle)
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # Top → bottom
    y1 = draw_top_strip(c)                  # title strip
    y2 = draw_slogan_band(c, y1)            # slogan band

    # Reserve space for bottom blocks
    # bottom-up calculation:
    footer_h = 60 * mm + 4 * mm
    ethics_h = 65 * mm + 2 * mm
    tech_h = 26 * mm + 1 * mm
    bottom_band_h = footer_h + ethics_h + tech_h

    y_columns_top = y2 - 4 * mm
    y_columns_bottom = M + bottom_band_h + 4 * mm

    draw_three_columns(c, y_columns_top, y_columns_bottom)

    # Bottom (bottom-up)
    tech_y = draw_tech_strip(c, y_columns_bottom - tech_h)
    ethics_y = draw_ethics_callout(c, tech_y)
    draw_footer(c, ethics_y)

    draw_print_marks(c)
    c.showPage()
    c.save()
    print(f"OK → {out}  ({os.path.getsize(out) / 1024:.1f} KB · "
          f"{W / mm:.0f} × {H / mm:.0f} mm)")


if __name__ == "__main__":
    build_poster()
