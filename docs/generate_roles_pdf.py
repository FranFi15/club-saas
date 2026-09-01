"""Genera docs/roles-interfaces.pdf — guía breve de cada interfaz por rol.

Nota: la guía pública del sitio usa docs/Hermes Club App.pdf (Canva).
Este script queda para una versión texto/PDF interna si hace falta.
"""

import json
from pathlib import Path

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(__file__).with_name("roles-interfaces.pdf")
DATA = Path(__file__).resolve().parents[1] / "website" / "src" / "data" / "rolesInterfaces.json"

NAVY = HexColor("#0f172a")
BLUE = HexColor("#1d4ed8")
SLATE = HexColor("#334155")
MUTED = HexColor("#64748b")
LINE = HexColor("#e2e8f0")
BG_SOFT = HexColor("#f8fafc")
TEAL = HexColor("#0f766e")
AMBER = HexColor("#b45309")
VIOLET = HexColor("#6d28d9")


def rgb_tint(hex_color, factor=0.12):
    c = HexColor(hex_color)
    return Color(
        1 - (1 - c.red) * factor,
        1 - (1 - c.green) * factor,
        1 - (1 - c.blue) * factor,
    )


GROUPS = json.loads(DATA.read_text(encoding="utf-8"))["groups"]


def build_styles():
    base = getSampleStyleSheet()
    styles = {
        "cover_kicker": ParagraphStyle(
            "cover_kicker",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            textColor=HexColor("#93c5fd"),
            letterSpacing=1.2,
            alignment=TA_CENTER,
            spaceAfter=6,
        ),
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=26,
            leading=32,
            textColor=white,
            alignment=TA_CENTER,
            spaceAfter=8,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=16,
            textColor=HexColor("#cbd5e1"),
            alignment=TA_CENTER,
        ),
        "h_group": ParagraphStyle(
            "h_group",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=13,
            textColor=NAVY,
            spaceBefore=4,
            spaceAfter=8,
        ),
        "intro": ParagraphStyle(
            "intro",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=15,
            textColor=SLATE,
            alignment=TA_JUSTIFY,
            spaceAfter=10,
        ),
        "role_name": ParagraphStyle(
            "role_name",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=12,
            textColor=NAVY,
            leading=15,
        ),
        "role_code": ParagraphStyle(
            "role_code",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            textColor=MUTED,
        ),
        "role_tabs": ParagraphStyle(
            "role_tabs",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=8.5,
            textColor=SLATE,
            leading=12,
            spaceBefore=2,
            spaceAfter=4,
        ),
        "role_sum": ParagraphStyle(
            "role_sum",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=13,
            textColor=SLATE,
            spaceAfter=4,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=12,
            textColor=SLATE,
            leftIndent=10,
            bulletIndent=0,
            spaceBefore=1,
            spaceAfter=1,
        ),
        "index_name": ParagraphStyle(
            "index_name",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            textColor=NAVY,
        ),
        "index_desc": ParagraphStyle(
            "index_desc",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            textColor=MUTED,
            leading=11,
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
        "note": ParagraphStyle(
            "note",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=12,
            textColor=MUTED,
            alignment=TA_LEFT,
        ),
    }
    return styles


def header_footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(NAVY)
    canvas.rect(0, h - 14 * mm, w, 14 * mm, fill=1, stroke=0)
    canvas.setFillColor(white)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(18 * mm, h - 9 * mm, "Hermes Club App")
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(w - 18 * mm, h - 9 * mm, "Guía de roles e interfaces")
    canvas.setFillColor(LINE)
    canvas.rect(0, 0, w, 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(18 * mm, 5 * mm, "Uso interno · cada persona ve solo su interfaz")
    canvas.drawRightString(w - 18 * mm, 5 * mm, f"{doc.page}")
    canvas.restoreState()


def cover_page(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, w, h, fill=1, stroke=0)
    canvas.setFillColor(BLUE)
    canvas.rect(0, h - 8 * mm, w, 8 * mm, fill=1, stroke=0)
    canvas.setFillColor(HexColor("#1e3a8a"))
    canvas.rect(0, 0, w, 28 * mm, fill=1, stroke=0)
    canvas.setFillColor(HexColor("#94a3b8"))
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(w / 2, 12 * mm, "Documento generado a partir de las interfaces actuales de la app")
    canvas.restoreState()


def role_card(role, accent_hex, styles):
    accent = HexColor(accent_hex)
    tint = rgb_tint(accent_hex, 0.1)
    bullets = [
        Paragraph(f"•  {item}", styles["bullet"]) for item in role["can"]
    ]
    inner = [
        Paragraph(role["name"], styles["role_name"]),
        Paragraph(f"Código interno: {role['code']}", styles["role_code"]),
        Paragraph(f"Pestañas: {role['tabs']}", styles["role_tabs"]),
        Paragraph(role["summary"], styles["role_sum"]),
        *bullets,
    ]
    data = [[inner]]
    t = Table(data, colWidths=[170 * mm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), tint),
                ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                ("LINEBEFORE", (0, 0), (0, 0), 3.2, accent),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return KeepTogether([t, Spacer(1, 4.5 * mm)])


def index_table(styles):
    rows = [
        [
            Paragraph("<b>Rol</b>", styles["index_name"]),
            Paragraph("<b>Interfaz</b>", styles["index_name"]),
        ]
    ]
    for group in GROUPS:
        for role in group["roles"]:
            rows.append(
                [
                    Paragraph(role["name"], styles["index_name"]),
                    Paragraph(role["tabs"], styles["index_desc"]),
                ]
            )
    t = Table(rows, colWidths=[52 * mm, 118 * mm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), white),
                ("BACKGROUND", (0, 1), (-1, -1), BG_SOFT),
                ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    # Recolor header text via paragraphs already navy; paint header cells
    header_style = ParagraphStyle(
        "idx_h",
        parent=styles["index_name"],
        textColor=white,
        fontName="Helvetica-Bold",
        fontSize=9,
    )
    rows[0] = [
        Paragraph("Rol", header_style),
        Paragraph("Pestañas de la interfaz", header_style),
    ]
    t = Table(rows, colWidths=[52 * mm, 118 * mm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("BACKGROUND", (0, 1), (-1, -1), BG_SOFT),
                ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return t


def build():
    meta = json.loads(DATA.read_text(encoding="utf-8"))
    styles = build_styles()
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=20 * mm,
        bottomMargin=16 * mm,
        title="Hermes Club App — Guía de roles e interfaces",
        author="Hermes Club App",
        subject="Qué puede hacer cada rol en la app",
    )

    story = []

    # Cover content sits on navy page via cover_page; need white text there.
    cover_styles_kicker = ParagraphStyle(
        "ck", parent=styles["cover_kicker"], textColor=HexColor("#93c5fd")
    )
    cover_title = styles["cover_title"]
    cover_sub = styles["cover_sub"]
    story.append(Spacer(1, 70 * mm))
    story.append(Paragraph("HERMES CLUB APP", cover_styles_kicker))
    story.append(Paragraph("Guía de roles<br/>e interfaces", cover_title))
    story.append(Spacer(1, 6 * mm))
    story.append(
        Paragraph(
            "Una explicación breve, en español, de lo que puede hacer<br/>"
            "cada perfil cuando entra a la aplicación del club.",
            cover_sub,
        )
    )
    story.append(PageBreak())

    story.append(
        Paragraph(
            meta["intro"],
            styles["intro"],
        )
    )
    story.append(
        Paragraph(
            meta["note"],
            styles["note"],
        )
    )
    story.append(Spacer(1, 4 * mm))
    story.append(index_table(styles))
    story.append(PageBreak())

    for group in GROUPS:
        first = True
        for role in group["roles"]:
            card = role_card(role, group["color"], styles)
            if first:
                story.append(
                    KeepTogether(
                        [Paragraph(group["title"], styles["h_group"]), card]
                    )
                )
                first = False
            else:
                story.append(card)

    story.append(Spacer(1, 2 * mm))
    story.append(
        Paragraph(
            "Nota: el cuerpo técnico (profesor, preparador, nutricionista y psicólogo) "
            "solo opera sobre las categorías o atletas que el club le asignó. "
            "Atleta, tutor y socio son perfiles de miembro: pagan cuotas y no gestionan el club.",
            styles["note"],
        )
    )

    def first_page(canvas, doc):
        cover_page(canvas, doc)

    def later_pages(canvas, doc):
        header_footer(canvas, doc)

    doc.build(story, onFirstPage=first_page, onLaterPages=later_pages)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
