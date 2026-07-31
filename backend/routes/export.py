"""
Export endpoints — generate presentation-ready files from computed ROI data.
Supports: Value at a Glance (.pptx) and Lifetime Value (.html / .pptx).
"""
import io
import json
import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel
from pptx import Presentation
from pptx.chart.data import ChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt

_LV_TEMPLATE = Path(__file__).parent.parent / "templates" / "lifetime-value.html"

router = APIRouter(prefix="/api/export")

# ─── Shared helpers ───────────────────────────────────────────────────────────

def _rgb(hex_color: str) -> RGBColor:
    h = hex_color.lstrip("#")
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _solid_fill(shape, hex_color: str):
    shape.fill.solid()
    shape.fill.fore_color.rgb = _rgb(hex_color)


def _add_text_box(slide, left, top, width, height, text, font_size,
                  bold=False, color="#ffffff", align=PP_ALIGN.LEFT,
                  wrap=True):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = wrap
    tf.auto_size = None
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.name = "Calibri"
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.color.rgb = _rgb(color)
    return txBox


# ─── Value at a Glance — assets & constants ──────────────────────────────────

_VAG_LOGO     = Path(__file__).parent.parent / "assets"    / "logo-white.png"
_VAG_TEMPLATE = Path(__file__).parent.parent / "templates" / "value-at-a-glance.html"

# Widescreen 16:9 — matches PowerPoint "Widescreen" preset
_W = Inches(13.333)
_H = Inches(7.5)

# Palette
_NAVY   = "#001941"
_NAVY2  = "#0a2650"   # KPI card body / zebra-even rows
_NAVY3  = "#12315f"   # total row
_YELLOW = "#ffad00"
_WHITE  = "#ffffff"
_MUTE   = "#9aa6bc"   # sub-labels / muted text
_DASH_C = "#54627a"   # en-dash color for empty cells
_RED    = "#e5546a"
_ORANGE = "#fb790f"
_TEAL   = "#2aadab"
_GREEN  = "#5fd1a7"

# Column layout — 3 groups × 2 cols.  Order matches the addon spec.
_GROUPS = [
    ("RISK",            _RED,    [("idRisk",  "Identified"), ("remRisk",  "Remaining")]),
    ("COST AVOIDANCE",  _YELLOW, [("avoidId", "Identified"), ("avoidAcc", "Accomplished")]),
    ("COST SAVINGS",    _GREEN,  [("savPot",  "Potential"),  ("savReal",  "Realized")]),
]
_FLAT        = [(k, sub) for _, _, cols in _GROUPS for k, sub in cols]
_FLAT_COLORS = [_RED, _RED, _YELLOW, _ORANGE, _TEAL, _GREEN]

_KPI_META = [
    ("idRisk",   "Identified Risk",            _RED),
    ("remRisk",  "Remaining Risk",             _RED),
    ("avoidId",  "Cost Avoidance Identified",  _YELLOW),
    ("avoidAcc", "Avoidance Accomplished",     _ORANGE),
    ("savPot",   "Potential Cost Savings",     _TEAL),
    ("savReal",  "Realized Cost Savings",      _GREEN),
]

# ─── VAG request model (raw numbers — backend formats) ────────────────────────

class GlanceRow(BaseModel):
    pub:     str
    idRisk:  Optional[float] = None
    remRisk: Optional[float] = None
    avoidId: Optional[float] = None
    avoidAcc: Optional[float] = None
    savPot:  Optional[float] = None
    savReal: Optional[float] = None

class ValueAtAGlanceExportRequest(BaseModel):
    period: str           # e.g. "FY2023 – FY2026"
    client: str = ""      # used for filename
    rows:   list[GlanceRow]
    total:  GlanceRow

# ─── Shared shape helpers ─────────────────────────────────────────────────────

def _no_line(shape):
    shape.line.fill.background()


def _cell_style(cell, bg_hex: str, fg_hex: str, text: str,
                font_size: float, bold: bool,
                align=PP_ALIGN.RIGHT, wrap: bool = False):
    cell.fill.solid()
    cell.fill.fore_color.rgb = _rgb(bg_hex)
    cell.margin_left   = Inches(0.06)
    cell.margin_right  = Inches(0.06)
    cell.margin_top    = Inches(0.03)
    cell.margin_bottom = Inches(0.03)
    cell.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf = cell.text_frame
    tf.word_wrap = wrap
    for para in tf.paragraphs:
        for run in para.runs:
            run.text = ""
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.name = "Calibri"
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.color.rgb = _rgb(fg_hex)


def _money(v: Optional[float]) -> Optional[str]:
    if not v:
        return None
    av = abs(v)
    if av >= 1e9:
        s = f"{v / 1e9:.1f}".rstrip("0").rstrip(".")
        return f"${s}B"
    if av >= 1e6:
        s = f"{v / 1e6:.1f}".rstrip("0").rstrip(".")
        return f"${s}M"
    if av >= 1e3:
        return f"${round(v / 1e3):,}K"
    return f"${round(v):,}"


# ─── VAG PPTX builder ─────────────────────────────────────────────────────────

def _build_vag_pptx(req: ValueAtAGlanceExportRequest) -> bytes:
    prs = Presentation()
    prs.slide_width  = _W
    prs.slide_height = _H
    slide = prs.slides.add_slide(prs.slide_layouts[6])   # blank

    mx = Inches(0.42)   # left margin (inset from rail)

    # ── Navy background ──────────────────────────────────────────────────────
    bg = slide.shapes.add_shape(1, 0, 0, _W, _H)
    _solid_fill(bg, _NAVY); _no_line(bg)

    # ── Gold left rail ───────────────────────────────────────────────────────
    rail = slide.shapes.add_shape(1, 0, 0, Inches(0.08), _H)
    _solid_fill(rail, _YELLOW); _no_line(rail)

    # ── Period eyebrow ───────────────────────────────────────────────────────
    _add_text_box(slide, mx, Inches(0.20), Inches(8), Inches(0.26),
                  req.period.upper(), 10, bold=True, color=_YELLOW, wrap=False)

    # ── Title ────────────────────────────────────────────────────────────────
    _add_text_box(slide, mx, Inches(0.42), Inches(9.5), Inches(0.62),
                  "Value at a Glance", 34, bold=True, color=_WHITE, wrap=False)

    # ── Yellow accent bar under title ────────────────────────────────────────
    ubar = slide.shapes.add_shape(1, mx, Inches(1.02), Inches(1.0), Inches(0.05))
    _solid_fill(ubar, _YELLOW); _no_line(ubar)

    # ── Logo (top-right) ─────────────────────────────────────────────────────
    if _VAG_LOGO.exists():
        slide.shapes.add_picture(
            str(_VAG_LOGO),
            _W - Inches(1.45), Inches(0.18),
            height=Inches(0.34),
        )

    # ── KPI cards (navy2 bg, colored top bar) ────────────────────────────────
    n_kpi   = len(_KPI_META)
    gap     = Inches(0.09)
    kpi_top = Inches(1.14)
    kpi_h   = Inches(1.36)
    bar_h   = Inches(0.06)
    card_h  = kpi_h - bar_h
    avail_w = _W - 2 * mx - (n_kpi - 1) * gap
    card_w  = avail_w / n_kpi

    for i, (key, label, color) in enumerate(_KPI_META):
        x   = mx + i * (card_w + gap)
        raw = getattr(req.total, key)
        fmt = _money(raw) or "—"

        top_bar = slide.shapes.add_shape(1, x, kpi_top, card_w, bar_h)
        _solid_fill(top_bar, color); _no_line(top_bar)

        body = slide.shapes.add_shape(1, x, kpi_top + bar_h, card_w, card_h)
        _solid_fill(body, _NAVY2); _no_line(body)

        val_h = card_h * 0.54
        _add_text_box(slide,
                      x + Inches(0.05), kpi_top + bar_h + Inches(0.07),
                      card_w - Inches(0.10), val_h,
                      fmt, 20, bold=True,
                      color=_WHITE if fmt != "—" else _MUTE,
                      align=PP_ALIGN.CENTER, wrap=False)

        _add_text_box(slide,
                      x + Inches(0.05), kpi_top + bar_h + val_h + Inches(0.02),
                      card_w - Inches(0.10), card_h * 0.40,
                      label, 8, bold=False, color=_MUTE,
                      align=PP_ALIGN.CENTER, wrap=True)

    # ── Publisher table ───────────────────────────────────────────────────────
    if not req.rows:
        buf = io.BytesIO(); prs.save(buf); return buf.getvalue()

    tbl_top  = Inches(2.60)
    tbl_left = mx
    tbl_w    = _W - 2 * mx
    tbl_h    = _H - tbl_top - Inches(0.18)

    n_data = len(req.rows)
    n_rows = n_data + 3   # super-header + sub-header + data rows + total
    n_cols = 7            # publisher + 6 metric columns

    tbl_shape = slide.shapes.add_table(n_rows, n_cols, tbl_left, tbl_top, tbl_w, tbl_h)
    tbl = tbl_shape.table

    # Column widths
    pub_w  = int(Inches(1.60))
    met_w  = int((tbl_w - pub_w) / 6)
    tbl.columns[0].width = pub_w
    for ci in range(1, 7):
        tbl.columns[ci].width = met_w

    # Row heights
    super_h = int(Inches(0.29))
    sub_h   = int(Inches(0.26))
    body_h  = int(min((tbl_h - super_h - sub_h) / (n_data + 1), Inches(0.37)))
    tbl.rows[0].height = super_h
    tbl.rows[1].height = sub_h
    for ri in range(2, n_rows):
        tbl.rows[ri].height = body_h

    # Super-header row (row 0): group label cells merged across 2 cols each
    _cell_style(tbl.cell(0, 0), _NAVY, _MUTE, "PUBLISHER", 7.5, True, PP_ALIGN.LEFT)
    ci = 1
    for grp_name, grp_color, _ in _GROUPS:
        tbl.cell(0, ci).merge(tbl.cell(0, ci + 1))
        _cell_style(tbl.cell(0, ci), _NAVY, grp_color, grp_name, 8.5, True, PP_ALIGN.CENTER)
        ci += 2

    # Sub-header row (row 1)
    _cell_style(tbl.cell(1, 0), _NAVY, _WHITE, "Publisher", 8, True, PP_ALIGN.LEFT)
    for ci, (_, sub) in enumerate(_FLAT, start=1):
        _cell_style(tbl.cell(1, ci), _NAVY, _MUTE, sub, 7.5, True, PP_ALIGN.CENTER)

    # Data rows (rows 2 … n_data+1)
    for ri, pub_row in enumerate(req.rows, start=2):
        bg = _NAVY if ri % 2 == 0 else _NAVY2
        _cell_style(tbl.cell(ri, 0), bg, _WHITE, pub_row.pub, 9.5, True, PP_ALIGN.LEFT)
        for ci, ((key, _), color) in enumerate(zip(_FLAT, _FLAT_COLORS), start=1):
            raw = getattr(pub_row, key)
            fmt = _money(raw) or "—"
            fg  = _DASH_C if fmt == "—" else color
            _cell_style(tbl.cell(ri, ci), bg, fg, fmt, 9.5, False)

    # Total row
    tri = n_data + 2
    _cell_style(tbl.cell(tri, 0), _NAVY3, _WHITE, "TOTAL", 10, True, PP_ALIGN.LEFT)
    for ci, ((key, _), color) in enumerate(zip(_FLAT, _FLAT_COLORS), start=1):
        raw = getattr(req.total, key)
        fmt = _money(raw) or "—"
        fg  = _DASH_C if fmt == "—" else color
        _cell_style(tbl.cell(tri, ci), _NAVY3, fg, fmt, 10, True)

    # ── Footer ───────────────────────────────────────────────────────────────
    _add_text_box(slide, mx, _H - Inches(0.24), _W - 2 * mx, Inches(0.20),
                  "© 2026 Anglepoint Group, Inc. Confidential.",
                  7.5, False, "#3a5070", PP_ALIGN.RIGHT)

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


# ─── VAG HTML builder (injects data into the branded template) ────────────────

def _build_vag_html(req: ValueAtAGlanceExportRequest) -> str:
    template = _VAG_TEMPLATE.read_text(encoding="utf-8")

    def _row(r: GlanceRow) -> dict:
        return {k: getattr(r, k) for k in
                ("pub", "idRisk", "remRisk", "avoidId", "avoidAcc", "savPot", "savReal")}

    data_dict = {
        "period": req.period,
        "rows":   [_row(r) for r in req.rows],
        "total":  _row(req.total),
    }
    payload  = "const data=" + json.dumps(data_dict, ensure_ascii=False) + ";"
    new_html = re.sub(r"const data=\{.*?\n\};", payload, template,
                      count=1, flags=re.DOTALL)
    return new_html


# ─── Value at a Glance routes ─────────────────────────────────────────────────

@router.post("/value-at-a-glance.pptx")
def export_value_at_a_glance_pptx(req: ValueAtAGlanceExportRequest):
    pptx_bytes = _build_vag_pptx(req)
    slug = req.client.replace(" ", "_") if req.client else "Value_at_a_Glance"
    filename = f"{slug}_Value_at_a_Glance.pptx"
    return Response(
        content=pptx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/value-at-a-glance.html")
def export_value_at_a_glance_html(req: ValueAtAGlanceExportRequest):
    html = _build_vag_html(req)
    slug = req.client.replace(" ", "_") if req.client else "Value_at_a_Glance"
    filename = f"{slug}_Value_at_a_Glance.html"
    return Response(
        content=html.encode("utf-8"),
        media_type="text/html",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ─── Lifetime Value models ─────────────────────────────────────────────────────

class LVGroup(BaseModel):
    accent: str           # "opt" | "sav"
    tag: str
    metric: str
    value: float          # accomplished $M
    identified: float     # identified $M
    identified_label: str

class LVHeadline(BaseModel):
    value: str
    caption: str
    subtitle: str

class LVChip(BaseModel):
    value: str
    label: str

class LVCategory(BaseModel):
    label: str
    identified: float
    accomplished: float

class LVChart(BaseModel):
    title: str
    categories: list[LVCategory]
    series_names: dict = {"identified": "Identified", "accomplished": "Accomplished"}
    y_axis_max: float = 16
    y_ticks: int = 4

class LifetimeValueExportRequest(BaseModel):
    client: str
    scope: str
    groups: list[LVGroup]
    headline: LVHeadline
    chips: list[LVChip]
    chart: LVChart


# ─── Lifetime Value HTML helpers ───────────────────────────────────────────────

def _js(s: str) -> str:
    """JSON-encode a string for safe embedding in a JS literal."""
    return json.dumps(str(s))


def _build_slide_data_js(req: LifetimeValueExportRequest) -> str:
    """Build the JS `const slideData = {...};` block to inject into the template.

    Icon variables (ICON_OPT, ICON_SAV) are referenced by name so the template's
    inline SVGs are preserved — they can't be round-tripped through JSON.
    """
    icon_vars = ["ICON_OPT", "ICON_SAV"]
    groups_js = ",\n    ".join(
        f'{{ accent:{_js(g.accent)}, icon:{icon_vars[i] if i < len(icon_vars) else "\"\""},'
        f' tag:{_js(g.tag)},\n'
        f'      metric:{_js(g.metric)}, value:{g.value}, identified:{g.identified},'
        f'\n      identifiedLabel:{_js(g.identified_label)} }}'
        for i, g in enumerate(req.groups)
    )
    chips_js = ",\n    ".join(
        f'{{ value:{_js(ch.value)}, label:{_js(ch.label)} }}'
        for ch in req.chips
    )
    cats_js = ",\n      ".join(
        f'{{ label:{_js(c.label)}, identified:{c.identified}, accomplished:{c.accomplished} }}'
        for c in req.chart.categories
    )
    sn = req.chart.series_names
    return (
        f'const slideData = {{\n'
        f'  client:{_js(req.client)},\n'
        f'  scope:{_js(req.scope)},\n'
        f'  groups:[\n    {groups_js}\n  ],\n'
        f'  headline:{{ value:{_js(req.headline.value)}, caption:{_js(req.headline.caption)},\n'
        f'    subtitle:{_js(req.headline.subtitle)} }},\n'
        f'  chips:[\n    {chips_js}\n  ],\n'
        f'  chart:{{\n'
        f'    title:{_js(req.chart.title)},\n'
        f'    seriesNames:{{ identified:{_js(sn.get("identified","Identified"))}, accomplished:{_js(sn.get("accomplished","Accomplished"))} }},\n'
        f'    yAxisMax:{req.chart.y_axis_max}, yTicks:{req.chart.y_ticks},\n'
        f'    categories:[\n      {cats_js}\n    ]\n'
        f'  }}\n'
        f'}};'
    )


# ─── Lifetime Value PPTX builder ───────────────────────────────────────────────

_LV_NAVY   = "#001941"
_LV_NAVY2  = "#003861"
_LV_BLUE   = "#005F86"
_LV_GOLD   = "#FFAD00"
_LV_WHITE  = "#FFFFFF"
_LV_LIGHT  = "#F2F4F6"


def _lv_text(slide, left, top, width, height, text, size,
             bold=False, color=_LV_WHITE, align=PP_ALIGN.LEFT, wrap=True):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = wrap
    tf.auto_size = None
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.name = "Calibri"
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = _rgb(color)
    return tb


def _build_lv_pptx(req: LifetimeValueExportRequest) -> bytes:
    prs = Presentation()
    prs.slide_width  = Inches(13.333)
    prs.slide_height = Inches(7.5)

    slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank

    W = Inches(13.333)
    H = Inches(7.5)

    # ── Full background ────────────────────────────────────────────────────────
    bg = slide.shapes.add_shape(1, 0, 0, W, H)
    _solid_fill(bg, _LV_NAVY)
    _no_line(bg)

    # ── Left rail (28% width) ─────────────────────────────────────────────────
    RAIL_W = Inches(3.5)
    rail = slide.shapes.add_shape(1, 0, 0, RAIL_W, H)
    _solid_fill(rail, _LV_NAVY2)
    _no_line(rail)

    # Client name + scope
    _lv_text(slide, Inches(0.22), Inches(0.2), RAIL_W - Inches(0.3), Inches(0.38),
             req.client.upper(), 9, bold=True, color=_LV_GOLD)
    _lv_text(slide, Inches(0.22), Inches(0.56), RAIL_W - Inches(0.3), Inches(0.32),
             req.scope, 7.5, color="#aab8cc")

    # Two stat groups
    group_tops = [Inches(1.05), Inches(4.1)]
    accent_colors = {"opt": _LV_GOLD, "sav": _LV_BLUE}

    for i, g in enumerate(req.groups[:2]):
        gy = group_tops[i]
        accent = accent_colors.get(g.accent, _LV_BLUE)

        # Accent rule
        rule = slide.shapes.add_shape(1, Inches(0.22), gy, Inches(0.06), Inches(1.9))
        _solid_fill(rule, accent)
        _no_line(rule)

        # Tag
        _lv_text(slide, Inches(0.36), gy, RAIL_W - Inches(0.46), Inches(0.28),
                 g.tag.upper(), 7.5, bold=True, color="#aab8cc")

        # Metric name
        _lv_text(slide, Inches(0.36), gy + Inches(0.28), RAIL_W - Inches(0.46), Inches(0.32),
                 g.metric, 9, color=_LV_WHITE)

        # Big value
        val_str = f"${g.value:.1f}M" if g.value < 100 else f"${g.value:.0f}M"
        _lv_text(slide, Inches(0.36), gy + Inches(0.58), RAIL_W - Inches(0.46), Inches(0.6),
                 val_str, 28, bold=True, color=_LV_WHITE)

        # Capture bar track
        bar_top = gy + Inches(1.22)
        bar_w   = RAIL_W - Inches(0.58)
        track = slide.shapes.add_shape(1, Inches(0.36), bar_top, bar_w, Inches(0.1))
        _solid_fill(track, "#1a2a4a")
        _no_line(track)

        # Capture bar fill
        cap_pct = (g.value / g.identified) if g.identified else 0
        fill_w  = max(Inches(0.05), int(bar_w * min(cap_pct, 1.0)))
        fill = slide.shapes.add_shape(1, Inches(0.36), bar_top, fill_w, Inches(0.1))
        _solid_fill(fill, accent)
        _no_line(fill)

        # Capture %
        cap_label = f"{round(cap_pct * 100)}% of {g.identified_label}"
        _lv_text(slide, Inches(0.36), bar_top + Inches(0.13), RAIL_W - Inches(0.46), Inches(0.24),
                 cap_label, 8, color="#aab8cc")

    # ── Main area ──────────────────────────────────────────────────────────────
    MX = Inches(3.7)
    MW = W - MX - Inches(0.25)

    # Headline value
    _lv_text(slide, MX, Inches(0.28), Inches(5.5), Inches(1.1),
             req.headline.value, 52, bold=True, color=_LV_WHITE)

    # Caption
    _lv_text(slide, MX, Inches(1.36), Inches(5.5), Inches(0.38),
             req.headline.caption, 13, color="#aab8cc")

    # Subtitle
    _lv_text(slide, MX, Inches(1.72), MW, Inches(0.5),
             req.headline.subtitle, 10, color="#ccd5e0", wrap=True)

    # KPI chips
    chip_y = Inches(2.3)
    chip_x = MX
    for ch in req.chips[:2]:
        chip_w = Inches(2.5)
        chip_bg = slide.shapes.add_shape(1, chip_x, chip_y, chip_w, Inches(0.65))
        _solid_fill(chip_bg, _LV_LIGHT)
        _no_line(chip_bg)
        # Gold left edge
        edge = slide.shapes.add_shape(1, chip_x, chip_y, Inches(0.05), Inches(0.65))
        _solid_fill(edge, _LV_GOLD)
        _no_line(edge)
        _lv_text(slide, chip_x + Inches(0.12), chip_y + Inches(0.04),
                 chip_w - Inches(0.18), Inches(0.3),
                 ch.value, 13, bold=True, color=_LV_NAVY)
        _lv_text(slide, chip_x + Inches(0.12), chip_y + Inches(0.34),
                 chip_w - Inches(0.18), Inches(0.26),
                 ch.label, 8, color="#5a6e8c")
        chip_x += chip_w + Inches(0.14)

    # ── Grouped bar chart ─────────────────────────────────────────────────────
    if req.chart.categories:
        chart_data = ChartData()
        chart_data.categories = [c.label for c in req.chart.categories]
        chart_data.add_series(
            req.chart.series_names.get("identified", "Identified"),
            tuple(c.identified for c in req.chart.categories),
        )
        chart_data.add_series(
            req.chart.series_names.get("accomplished", "Accomplished"),
            tuple(c.accomplished for c in req.chart.categories),
        )

        chart_frame = slide.shapes.add_chart(
            XL_CHART_TYPE.COLUMN_CLUSTERED,
            MX, Inches(3.15), MW, Inches(4.1),
            chart_data,
        )
        chart = chart_frame.chart

        chart.chart_title.text_frame.text = req.chart.title
        chart.chart_title.text_frame.paragraphs[0].runs[0].font.size = Pt(10)
        chart.chart_title.text_frame.paragraphs[0].runs[0].font.bold = False
        chart.chart_title.text_frame.paragraphs[0].runs[0].font.color.rgb = _rgb("#aab8cc")

        try:
            chart.plot_area.format.fill.solid()
            chart.plot_area.format.fill.fore_color.rgb = _rgb(_LV_NAVY)
        except Exception:
            pass

        try:
            chart.chart_area.format.fill.solid()
            chart.chart_area.format.fill.fore_color.rgb = _rgb(_LV_NAVY)
        except Exception:
            pass

        s0 = chart.series[0]
        s0.format.fill.solid()
        s0.format.fill.fore_color.rgb = _rgb(_LV_BLUE)

        s1 = chart.series[1]
        s1.format.fill.solid()
        s1.format.fill.fore_color.rgb = _rgb(_LV_GOLD)

        try:
            va = chart.value_axis
            va.format.line.color.rgb = _rgb("#1a2a4a")
            va.tick_labels.font.size = Pt(8)
            va.tick_labels.font.color.rgb = _rgb("#aab8cc")
            ca = chart.category_axis
            ca.format.line.color.rgb = _rgb("#1a2a4a")
            ca.tick_labels.font.size = Pt(8)
            ca.tick_labels.font.color.rgb = _rgb("#aab8cc")
        except Exception:
            pass

    # ── Footer ─────────────────────────────────────────────────────────────────
    _lv_text(slide, Inches(0.25), H - Inches(0.26), W - Inches(0.5), Inches(0.22),
             "© 2026 Anglepoint Group, Inc.  Confidential.",
             7.5, color="#3a5070", align=PP_ALIGN.RIGHT)

    out = io.BytesIO()
    prs.save(out)
    return out.getvalue()


# ─── Lifetime Value routes ─────────────────────────────────────────────────────

@router.post("/lifetime-value.html")
def export_lifetime_value_html(req: LifetimeValueExportRequest):
    """Inject live slideData into the branded HTML template and return it."""
    template = _LV_TEMPLATE.read_text(encoding="utf-8")
    new_block = _build_slide_data_js(req)
    new_html = re.sub(
        r'const slideData\s*=\s*\{.*?\};\s*(?=const NS)',
        new_block + "\n\n",
        template,
        flags=re.DOTALL,
    )
    filename = f"{req.client.replace(' ', '_')}_Lifetime_Value.html"
    return Response(
        content=new_html.encode("utf-8"),
        media_type="text/html",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/lifetime-value.pptx")
def export_lifetime_value_pptx(req: LifetimeValueExportRequest):
    """Build a widescreen PowerPoint slide for the Lifetime Value view."""
    pptx_bytes = _build_lv_pptx(req)
    filename = f"{req.client.replace(' ', '_')}_Lifetime_Value.pptx"
    return Response(
        content=pptx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
