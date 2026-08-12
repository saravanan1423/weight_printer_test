# Dot Matrix Ticket Format Layouts and Section Expanders
from ..common import (
    HEX_COLOR_DEFAULTS,
    PRINTER_LAYOUT_VERSION,
    DEFAULT_DOT_MATRIX_FONT_FAMILY,
    printer_type_config,
    normalize_text,
)

def default_dot_matrix_field_rows():
    return [
        {
            "id": "dot-info-row-1",
            "fields": [
                {"id": "dot-info-row-1-field-1", "label": "Slip / Bill No", "source": "serialNo", "cpi": 10},
                {"id": "dot-info-row-1-field-2", "label": "Date & Time", "source": "entryDate", "cpi": 10},
            ],
        },
        {
            "id": "dot-info-row-2",
            "fields": [
                {"id": "dot-info-row-2-field-1", "label": "Vehicle Number", "source": "vehicleNo", "cpi": 10},
                {"id": "dot-info-row-2-field-2", "label": "Customer Name", "source": "customer", "cpi": 10},
            ],
        },
        {
            "id": "dot-info-row-3",
            "fields": [
                {"id": "dot-info-row-3-field-1", "label": "Material Name", "source": "material", "cpi": 10},
                {"id": "dot-info-row-3-field-2", "label": "Charges (Rs.)", "source": "charges", "cpi": 10},
            ],
        },
    ]


def default_dot_matrix_weight_rows():
    return [
        {
            "id": "dot-weight-row-1",
            "fields": [
                {"id": "dot-weight-row-1-field-1", "label": "Gross Weight", "source": "grossWeight", "cpi": 10},
                {"id": "dot-weight-row-1-field-2", "label": "Tare Weight", "source": "tareWeight", "cpi": 10},
                {"id": "dot-weight-row-1-field-3", "label": "Net Weight", "source": "netWeight", "cpi": 10},
            ],
        },
    ]




def default_dot_matrix_printer_layout():
    config = printer_type_config("dot_matrix")
    text_color = "#000000"
    border = "#000000"
    field_rows = default_dot_matrix_field_rows()

    def static_text(
        element_id,
        name,
        x,
        y,
        w,
        h,
        text="",
        *,
        font_size=12,
        font_weight=800,
        text_color_value=None,
        background="transparent",
        border_color="transparent",
        border_width=0,
        radius=0,
        padding=1,
        align="center",
        z=1,
    ):
        return {
            "id": element_id,
            "kind": "staticText",
            "name": name,
            "x": x,
            "y": y,
            "w": w,
            "h": h,
            "text": text,
            "fontSize": font_size,
            "fontWeight": font_weight,
            "textColor": text_color_value or text_color,
            "backgroundColor": background,
            "borderColor": border_color,
            "borderWidth": border_width,
            "radius": radius,
            "padding": padding,
            "align": align,
            "fit": "contain",
            "z": z,
        }

    def weight_box(
        element_id,
        name,
        label,
        source,
        x,
        y,
        w,
        h,
        *,
        meta_sources=None,
        value_font_size=24,
        background="transparent",
    ):
        return {
            "id": element_id,
            "kind": "weight",
            "name": name,
            "x": x,
            "y": y,
            "w": w,
            "h": h,
            "label": label,
            "source": source,
            "unit": "kg",
            "fontSize": 12,
            "valueFontSize": value_font_size,
            "metaSources": meta_sources or [],
            "metaFontSize": 8,
            "fontWeight": 900,
            "textColor": text_color,
            "backgroundColor": background,
            "borderColor": border,
            "borderWidth": 1,
            "radius": 0,
            "padding": 1,
            "align": "center",
            "fit": "contain",
        }

    return {
        "version": PRINTER_LAYOUT_VERSION,
        "printerType": "dot_matrix",
        "page": {
            "widthMm": config["page"]["widthMm"],
            "heightMm": config["page"]["heightMm"],
            "orientation": "landscape",
            "backgroundColor": "#FFFFFF",
            "borderColor": "transparent",
            "borderWidth": 0,
        },
        "fieldRowsSettings": {
            "x": 0.0,
            "y": 22.0,
            "w": 100.0,
            "rowHeight": 5.8,
            "baseRows": 3,
            "shiftStartY": 40.0,
        },
        "fieldRows": field_rows,
        "managedSections": [
            {
                "id": "dot-matrix-ticket-fields",
                "name": "Ticket Fields",
                "x": 0.0,
                "y": 22.0,
                "w": 100.0,
                "rowHeight": 5.8,
                "baseRows": 3,
                "shiftStartY": 40.0,
                "rows": field_rows,
            },
        ],
        "elements": [
            static_text(
                "dot-company-name",
                "Company Name",
                0.0,
                2.0,
                100.0,
                5.5,
                "ABC WEIGHBRIDGE & LOGISTICS",
                font_size=18,
                font_weight=900,
                align="center",
            ),
            static_text(
                "dot-company-address",
                "Company Address",
                0.0,
                7.5,
                100.0,
                3.5,
                "Industrial Area, Phase-II, Highway Road",
                font_size=10,
                font_weight=700,
                align="center",
            ),
            static_text(
                "dot-company-contact",
                "Company Contact",
                0.0,
                11.0,
                100.0,
                3.5,
                "Phone: +91 98765 43210 | GSTIN: 33AAAAA0000A1Z5",
                font_size=9,
                font_weight=600,
                align="center",
            ),
            static_text(
                "dot-divider-top",
                "Divider Top",
                0.0,
                14.5,
                100.0,
                1.5,
                "--------------------------------------------------------------------------------",
                font_size=10,
                font_weight=700,
                align="center",
            ),
            static_text(
                "dot-ticket-title",
                "Ticket Title",
                0.0,
                16.0,
                100.0,
                4.2,
                "WEIGHMENT SLIP / RECEIPT",
                font_size=12,
                font_weight=900,
                align="center",
            ),
            static_text(
                "dot-divider-mid",
                "Divider Mid",
                0.0,
                20.2,
                100.0,
                1.5,
                "--------------------------------------------------------------------------------",
                font_size=10,
                font_weight=700,
                align="center",
            ),
            static_text(
                "dot-weight-heading",
                "Weight Heading",
                0.0,
                40.0,
                100.0,
                3.0,
                "--------------------------------------------------------------------------------",
                font_size=10,
                font_weight=700,
                align="center",
            ),
            weight_box("weight-1", "1st Weight", "Gross Weight", "grossWeight", 0.0, 43.5, 32.5, 14.5, meta_sources=["grossTime"], value_font_size=20),
            weight_box("weight-2", "2nd Weight", "Tare Weight", "tareWeight", 33.7, 43.5, 32.5, 14.5, meta_sources=["tareTime"], value_font_size=20),
            weight_box("weight-3", "Net Weight", "Net Weight", "netWeight", 67.5, 43.5, 32.5, 14.5, value_font_size=22),
            static_text(
                "dot-divider-weights-bot",
                "Divider Weights Bottom",
                0.0,
                58.5,
                100.0,
                1.5,
                "",
                font_size=10,
                font_weight=700,
                align="center",
            ),
            static_text(
                "dot-net-in-words",
                "Net in Words",
                0.0,
                60.0,
                100.0,
                3.5,
                "(TWENTY THOUSAND TWO HUNDRED FIFTY KILOGRAMS ONLY)",
                font_size=9,
                font_weight=700,
                align="center",
            ),
            static_text(
                "dot-footer-remarks",
                "Footer Remarks",
                0.0,
                64.0,
                100.0,
                3.5,
                "Remarks: Goods received in good condition. Subject to local jurisdiction.",
                font_size=9,
                font_weight=600,
                align="left",
            ),
            static_text(
                "dot-driver-sign",
                "Driver Signature",
                0.0,
                70.5,
                45.0,
                6.0,
                "Left Thumb / Driver Sign",
                font_size=10,
                font_weight=800,
                align="left",
            ),
            static_text(
                "dot-operator-sign",
                "Operator Signature",
                55.0,
                70.5,
                45.0,
                6.0,
                "Authorized Signatory",
                font_size=10,
                font_weight=800,
                align="right",
            ),
            {
                "id": "dot-print-break",
                "kind": "printBreak",
                "name": "Print Break",
                "x": 0.0,
                "y": 80.0,
                "w": 100.0,
                "h": 2.5,
            },
        ],
        "defaults": {
            "fontFamily": DEFAULT_DOT_MATRIX_FONT_FAMILY,
        },
    }




def empty_dot_matrix_printer_layout():
    config = printer_type_config("dot_matrix")
    return {
        "version": PRINTER_LAYOUT_VERSION,
        "templateKind": "blank_canvas",
        "printerType": "dot_matrix",
        "page": {
            "widthMm": config["page"]["widthMm"],
            "heightMm": config["page"]["heightMm"],
            "orientation": "landscape",
            "backgroundColor": "#FFFFFF",
            "borderColor": "transparent",
            "borderWidth": 0,
        },
        "fieldRowsSettings": {
            "x": 0.0,
            "y": 22.0,
            "w": 100.0,
            "rowHeight": 5.8,
            "baseRows": 0,
            "shiftStartY": 22.0,
        },
        "fieldRows": [],
        "managedSections": [
            {
                "id": "dot-matrix-empty-fields",
                "name": "Ticket Fields",
                "x": 0.0,
                "y": 22.0,
                "w": 100.0,
                "rowHeight": 5.8,
                "baseRows": 0,
                "shiftStartY": 22.0,
                "rows": [],
            },
        ],
        "elements": [],
        "defaults": {
            "fontFamily": DEFAULT_DOT_MATRIX_FONT_FAMILY,
        },
        # Nothing is forced onto a blank-canvas ticket — no dividers, no weight
        # box, no net-in-words — the RAW Studio grid starts completely empty
        # and everything is built up by dragging content in.
        "rawBlockPositions": {},
        "rawHeaderText": {},
        "rawStructuralBlocks": [],
    }




def expand_dot_matrix_full_width_elements(elements):
    expanded = []
    for element in elements:
        if not isinstance(element, dict):
            expanded.append(element)
            continue

        next_element = element.copy()
        x = float(next_element.get("x") or 0)
        w = float(next_element.get("w") or 0)
        text = str(next_element.get("text") or "").strip()
        is_divider = bool(text) and set(text) <= {"-", ".", "_", "=", " "}
        is_old_safe_area = 2.5 <= x <= 3.5 and 93.0 <= w <= 95.0
        is_wide_header = next_element.get("kind") == "staticText" and w >= 90.0

        if is_old_safe_area or is_divider or is_wide_header:
            next_element["x"] = 0.0
            next_element["w"] = 100.0
        expanded.append(next_element)
    return expanded


def expand_dot_matrix_full_width_sections(sections):
    expanded = []
    for section in sections:
        if not isinstance(section, dict):
            expanded.append(section)
            continue

        next_section = section.copy()
        try:
            x = float(next_section.get("x") or 0)
            w = float(next_section.get("w") or 0)
        except (TypeError, ValueError):
            expanded.append(next_section)
            continue

        if 2.5 <= x <= 3.5 and 93.0 <= w <= 95.0:
            next_section["x"] = 0.0
            next_section["w"] = 100.0
        expanded.append(next_section)
    return expanded




def is_outdated_empty_dot_matrix_template_layout(layout):
    if not isinstance(layout, dict):
        return True
    if normalize_text(layout.get("templateKind"), "", max_length=40) != "blank_canvas":
        return True
    return False
