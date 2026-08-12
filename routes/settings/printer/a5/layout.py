# A5 Ticket Format Layouts and Builders
from ..common import (
    HEX_COLOR_DEFAULTS,
    PRINTER_LAYOUT_VERSION,
    printer_type_config,
    normalize_text,
    layout_has_element,
    layout_page_matches,
)

def default_a5_field_rows():
    return [
        {
            "id": "a5-info-row-1",
            "fields": [
                {"id": "a5-info-row-1-field-1", "label": "S.No.", "source": "serialNo"},
                {"id": "a5-info-row-1-field-2", "label": "Date", "source": "entryDate"},
                {"id": "a5-info-row-1-field-3", "label": "Time", "source": "entryTime"},
                {"id": "a5-info-row-1-field-4", "label": "Vehicle No.", "source": "vehicleNo"},
            ],
        },
        {
            "id": "a5-info-row-2",
            "fields": [
                {"id": "a5-info-row-2-field-1", "label": "Party", "source": "customer"},
                {"id": "a5-info-row-2-field-2", "label": "Material", "source": "material"},
                {"id": "a5-info-row-2-field-3", "label": "Vehicle Type", "source": "weighingType"},
            ],
        },
        {
            "id": "a5-info-row-3",
            "fields": [
                {"id": "a5-info-row-3-field-1", "label": "Ref No.", "source": "refNo"},
                {"id": "a5-info-row-3-field-2", "label": "Mobile", "source": "mobileNo"},
                {"id": "a5-info-row-3-field-3", "label": "Payment", "source": "paymentMode"},
            ],
        },
    ]




def default_a5_printer_layout():
    config = printer_type_config("a5")
    border = "#24378C"
    heading = "#24378C"
    accent = "#D72F2F"
    text_color = "#102039"
    field_rows = default_a5_field_rows()

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
        value_font_size=27,
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
            "textColor": heading,
            "backgroundColor": background,
            "borderColor": border,
            "borderWidth": 1,
            "radius": 2,
            "padding": 1,
            "align": "center",
            "fit": "contain",
        }

    return {
        "version": PRINTER_LAYOUT_VERSION,
        "printerType": "a5",
        "page": {
            "widthMm": config["page"]["widthMm"],
            "heightMm": config["page"]["heightMm"],
            "orientation": "landscape",
            "backgroundColor": HEX_COLOR_DEFAULTS["pageBackground"],
            "borderColor": border,
            "borderWidth": config["page"]["borderWidth"],
        },
        "fieldRowsSettings": {
            "x": 3.0,
            "y": 25.0,
            "w": 94.0,
            "rowHeight": 6.3,
            "baseRows": 3,
            "shiftStartY": 46.0,
        },
        "fieldRows": field_rows,
        "managedSections": [
            {
                "id": "a5-ticket-fields",
                "name": "A5 Ticket Fields",
                "x": 3.0,
                "y": 25.0,
                "w": 94.0,
                "rowHeight": 6.3,
                "baseRows": 3,
                "shiftStartY": 46.0,
                "rows": field_rows,
            },
        ],
        "elements": [
            static_text("a5-header-box", "Header Box", 3.0, 3.0, 94.0, 18.5, border_color=border, border_width=1),
            static_text("a5-logo-box", "Logo Box", 4.2, 4.3, 10.0, 15.8, border_color=border, border_width=1),
            {
                "id": "a5-logo",
                "kind": "image",
                "name": "Logo",
                "x": 4.9,
                "y": 5.0,
                "w": 8.6,
                "h": 14.4,
                "imageUrl": "",
                "text": "",
                "fontSize": 12,
                "fontWeight": 800,
                "textColor": heading,
                "backgroundColor": "transparent",
                "borderColor": "transparent",
                "borderWidth": 0,
                "radius": 0,
                "padding": 1,
                "align": "center",
                "fit": "contain",
            },
            static_text(
                "a5-company-name",
                "Company Name",
                15.0,
                4.2,
                58.0,
                6.0,
                "WEIGHBRIDGE",
                font_size=24,
                font_weight=900,
                text_color_value=accent,
            ),
            static_text(
                "a5-company-address",
                "Company Address",
                16.0,
                10.0,
                56.0,
                4.2,
                "Address Line, City. Mobile : 00000 00000",
                font_size=12,
                font_weight=700,
                text_color_value=heading,
            ),
            static_text(
                "a5-capacity",
                "Capacity",
                27.0,
                15.0,
                33.0,
                4.4,
                "100 TONS CAPACITY",
                font_size=14,
                font_weight=900,
                text_color_value="#FFFFFF",
                background=heading,
                border_color=heading,
                border_width=1,
                radius=3,
            ),
            static_text(
                "a5-ticket-title",
                "Ticket Title",
                75.0,
                5.0,
                20.0,
                5.0,
                "WEIGHMENT SLIP",
                font_size=13,
                font_weight=900,
                text_color_value="#FFFFFF",
                background=heading,
                border_color=heading,
                border_width=1,
                radius=3,
            ),
            static_text(
                "a5-service-line-1",
                "Service Line 1",
                75.0,
                11.1,
                20.0,
                3.2,
                "SMS / WhatsApp",
                font_size=10,
                font_weight=900,
                text_color_value=accent,
            ),
            static_text(
                "a5-service-line-2",
                "Service Line 2",
                75.0,
                14.9,
                20.0,
                3.2,
                "CCTV Camera",
                font_size=10,
                font_weight=900,
                text_color_value=accent,
            ),
            static_text("a5-info-border", "Ticket Field Border", 3.0, 25.0, 94.0, 18.9, border_color=border, border_width=1),
            static_text(
                "a5-weight-heading",
                "Weight Heading",
                3.0,
                47.0,
                94.0,
                4.2,
                "WEIGHT DETAILS",
                font_size=13,
                font_weight=900,
                text_color_value="#FFFFFF",
                background=heading,
                border_color=heading,
                border_width=1,
            ),
            weight_box("weight-1", "1st Weight", "1st Weight", "grossWeight", 3.0, 53.0, 29.6, 18.5, meta_sources=["grossDate", "grossTime"]),
            weight_box("weight-2", "2nd Weight", "2nd Weight", "tareWeight", 35.2, 53.0, 29.6, 18.5, meta_sources=["tareDate", "tareTime"]),
            weight_box("weight-3", "Net Weight", "Net Weight", "netWeight", 67.4, 53.0, 29.6, 18.5, value_font_size=30, background="#F8FBFF"),
            {
                "id": "a5-charge",
                "kind": "field",
                "name": "Charges",
                "x": 3.0,
                "y": 74.5,
                "w": 29.6,
                "h": 7.0,
                "label": "Amount Rs.",
                "source": "charges",
                "fontSize": 12,
                "valueFontSize": 14,
                "fontWeight": 900,
                "textColor": heading,
                "backgroundColor": "transparent",
                "borderColor": border,
                "borderWidth": 1,
                "radius": 2,
                "padding": 2,
                "align": "left",
                "fit": "contain",
            },
            static_text(
                "a5-operator-sign",
                "Operator Signature",
                67.4,
                74.5,
                29.6,
                7.0,
                "Operator Signature",
                font_size=12,
                font_weight=900,
                text_color_value=heading,
                border_color=border,
                border_width=1,
                radius=2,
            ),
            static_text(
                "a5-footer-note",
                "Footer Note",
                3.0,
                84.5,
                61.8,
                5.2,
                "Note : Check the weight before vehicle leaving the platform.",
                font_size=11,
                font_weight=900,
                text_color_value=accent,
                border_color=border,
                border_width=1,
                align="left",
                padding=2,
            ),
            static_text(
                "a5-footer-thanks",
                "Footer Thanks",
                67.4,
                84.5,
                29.6,
                5.2,
                "Thank you! Visit Again!",
                font_size=11,
                font_weight=900,
                text_color_value=accent,
                border_color=border,
                border_width=1,
            ),
        ],
    }




def empty_a5_printer_layout():
    config = printer_type_config("a5")
    return {
        "version": PRINTER_LAYOUT_VERSION,
        "templateKind": "blank_canvas",
        "printerType": "a5",
        "page": {
            "widthMm": config["page"]["widthMm"],
            "heightMm": config["page"]["heightMm"],
            "orientation": "landscape",
            "backgroundColor": HEX_COLOR_DEFAULTS["pageBackground"],
            "borderColor": "transparent",
            "borderWidth": 0,
        },
        "fieldRowsSettings": {
            "x": 3.0,
            "y": 8.0,
            "w": 94.0,
            "rowHeight": 6.0,
            "baseRows": 0,
            "shiftStartY": 8.0,
        },
        "fieldRows": [],
        "managedSections": [
            {
                "id": "a5-empty-fields",
                "name": "A5 Empty Fields",
                "x": 3.0,
                "y": 8.0,
                "w": 94.0,
                "rowHeight": 6.0,
                "baseRows": 0,
                "shiftStartY": 8.0,
                "rows": [],
            },
        ],
        "elements": [],
    }




def is_outdated_empty_a5_template_layout(layout):
    if not isinstance(layout, dict):
        return True
    if normalize_text(layout.get("templateKind"), "", max_length=40) != "blank_canvas":
        return True
    if (
        layout_has_element(layout, "a5-header-box")
        or layout_has_element(layout, "a5-company-name")
        or layout_has_element(layout, "a5-weight-heading")
        or layout_has_element(layout, "header-strip-box")
    ):
        return True
    page = layout.get("page") if isinstance(layout.get("page"), dict) else {}
    if not layout.get("elements") and int(page.get("borderWidth") or 0) != 0:
        return True
    if not (
        layout_page_matches(layout, expected_width=210.0, expected_height=148.0)
        or layout_page_matches(layout, expected_width=148.0, expected_height=210.0)
    ):
        return True
    return False


