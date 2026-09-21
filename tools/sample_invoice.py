"""Build a sample invoice PDF for testing the Storage download path.

Usage: python3 tools/sample_invoice.py [invoice_number] [out.pdf]
The layout mirrors the first sample invoice in supabase-sample-data-bac1004.sql.
"""
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

NUMBER = sys.argv[1] if len(sys.argv) > 1 else "INV-2026-0001"
OUT = sys.argv[2] if len(sys.argv) > 2 else "sample-invoice.pdf"

BLUE = colors.HexColor("#336699")
NAVY = colors.HexColor("#1b3a57")
LINE = colors.HexColor("#dbe5ee")

lines = [
    ("DC-4001", "A0 drawing prints — tender set", "18,000.00"),
    ("DC-4002", "Spiral binding — 12 volumes", "6,000.00"),
    ("DC-4003", "A1 colour plots — layout revision", "24,000.00"),
]
subtotal, gst, total = 48000.00, 8640.00, 56640.00

styles = getSampleStyleSheet()
title = styles["Title"].clone("t", textColor=NAVY, fontSize=18, spaceAfter=2)
small = styles["Normal"].clone("s", textColor=NAVY, fontSize=9, leading=13)

doc = SimpleDocTemplate(OUT, pagesize=A4, title=NUMBER,
                        leftMargin=20 * mm, rightMargin=20 * mm,
                        topMargin=18 * mm, bottomMargin=18 * mm)

head = Table([[
    Paragraph("<b>Business Automation Centre</b><br/>"
              "1st Floor, #39 Aziz Nagar 2nd Street,<br/>"
              "Kodambakkam, Chennai 600 024, India<br/>"
              "+91 - 44 - 2484 0889 · bacipl@gmail.com", small),
    Paragraph(f"<b>TAX INVOICE</b><br/>Invoice no. {NUMBER}<br/>"
              "Invoice date: 05 Aug 2026<br/>Customer code: BAC-1004", small),
]], colWidths=[95 * mm, 75 * mm])
head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                          ("ALIGN", (1, 0), (1, 0), "RIGHT")]))

rows = [["DC no.", "Description", "Amount (INR)"]]
rows += [[dc, desc, amt] for dc, desc, amt in lines]
rows += [["", "Subtotal", f"{subtotal:,.2f}"],
         ["", "GST @ 18%", f"{gst:,.2f}"],
         ["", "Total payable", f"{total:,.2f}"]]

table = Table(rows, colWidths=[28 * mm, 102 * mm, 40 * mm])
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), BLUE),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (1, -1), (-1, -1), "Helvetica-Bold"),
    ("TEXTCOLOR", (0, 1), (-1, -1), NAVY),
    ("ALIGN", (2, 0), (2, -1), "RIGHT"),
    ("GRID", (0, 0), (-1, len(lines)), 0.5, LINE),
    ("LINEABOVE", (1, len(lines) + 1), (-1, len(lines) + 1), 0.5, LINE),
    ("LINEABOVE", (1, -1), (-1, -1), 1, BLUE),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
]))

doc.build([
    Paragraph("Business Automation Centre", title),
    Paragraph("Ultimate plotting solutions", small),
    Spacer(1, 10 * mm), head, Spacer(1, 10 * mm), table, Spacer(1, 8 * mm),
    Paragraph("Payment due within 30 days. Please quote the invoice number on "
              "every remittance. This is a sample document for testing the "
              "client dashboard download.", small),
])
print("wrote", OUT)
