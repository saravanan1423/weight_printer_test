import json
from pathlib import Path
from uuid import uuid4

from flask import current_app
from werkzeug.utils import secure_filename

from models.models import Printer_layout, db



from routes.weightment.weightment import (
    WEIGHMENT_CAMERA_IMAGE_COLUMNS,
    fetch_weighment_by_id,
    get_custom_field_column_names,
    serialize_weighment_row,
)

LEGACY_A4_DEFAULT_TEMPLATE_NAME = "default"
LEGACY_A5_DEFAULT_TEMPLATE_NAME = "A5 Landscape Default"
PRINTER_LAYOUT_NAME = "A4 Default 1"
A5_EMPTY_TEMPLATE_NAME = "A5 Empty Template"
DOT_MATRIX_EMPTY_TEMPLATE_NAME = "Dot Matrix Empty Template"
PRINTER_LAYOUT_SETTINGS_NAME = "__printer_layout_settings__"
MAX_PRINTER_LAYOUT_NAME_LENGTH = 50
DEFAULT_PRINTER_TYPE = "a4"
PRINTER_LAYOUT_VERSION = 14
DOT_MATRIX_RAW_GRID_SIZE = 40
DOT_MATRIX_RAW_MAX_LINES = 200
DOT_MATRIX_OPTIONAL_STRUCTURAL_BLOCKS = (
    "divider-top",
    "divider-mid",
    "divider-pre-weight",
    "divider-post-weight",
    "weight-box",
    "net-in-words",
)
PRINTER_TYPE_OPTIONS = (
    {
        "key": "a4",
        "label": "A4",
        "description": "Landscape A4 sheet format",
        "page": {
            "widthMm": 297.0,
            "heightMm": 210.0,
            "borderWidth": 2,
        },
        "limits": {
            "minWidthMm": 210.0,
            "maxWidthMm": 320.0,
            "minHeightMm": 140.0,
            "maxHeightMm": 230.0,
        },
    },
    {
        "key": "a5",
        "label": "A5",
        "description": "A5 sheet format with portrait or landscape orientation",
        "page": {
            "widthMm": 210.0,
            "heightMm": 148.0,
            "borderWidth": 2,
        },
        "limits": {
            "minWidthMm": 140.0,
            "maxWidthMm": 220.0,
            "minHeightMm": 140.0,
            "maxHeightMm": 220.0,
        },
    },
    {
        "key": "dot_matrix",
        "label": "Dot Matrix",
        "description": "Continuous tractor fanfold paper format (6-inch / 40-line RAW)",
        "page": {
            "widthMm": 216.0,
            "heightMm": 152.0,
            "borderWidth": 0,
        },
        "limits": {
            "minWidthMm": 1.0,
            "maxWidthMm": 1000.0,
            "minHeightMm": 1.0,
            "maxHeightMm": 1000.0,
        },
    },
)
PRINTER_TYPE_CONFIG = {
    option["key"]: option
    for option in PRINTER_TYPE_OPTIONS
}
PRINTER_TYPE_ORDER = {
    option["key"]: index
    for index, option in enumerate(PRINTER_TYPE_OPTIONS)
}
PRINTER_TYPE_DEFAULT_TEMPLATE_NAMES = {
    "a4": PRINTER_LAYOUT_NAME,
    "a5": "A5 Default",
    "dot_matrix": "Dot Matrix Default",
}
HEX_COLOR_DEFAULTS = {
    "pageBackground": "#FFFFFF",
    "pageBorder": "#2F3F95",
    "text": "#102039",
    "accent": "#D72F2F",
    "heading": "#24378C",
}
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_LAYOUT_ELEMENTS = 48
MIN_PAGE_WIDTH_MM = min(
    option["limits"]["minWidthMm"]
    for option in PRINTER_TYPE_OPTIONS
)
MAX_PAGE_WIDTH_MM = max(
    option["limits"]["maxWidthMm"]
    for option in PRINTER_TYPE_OPTIONS
)
MIN_PAGE_HEIGHT_MM = min(
    option["limits"]["minHeightMm"]
    for option in PRINTER_TYPE_OPTIONS
)
MAX_PAGE_HEIGHT_MM = max(
    option["limits"]["maxHeightMm"]
    for option in PRINTER_TYPE_OPTIONS
)
MAX_FIELD_ROWS = 200
MAX_FIELDS_PER_ROW = 6
FIELD_ROWS_SECTION_DEFAULTS = {
    "x": 2.0,
    "y": 24.0,
    "w": 96.0,
    "rowHeight": 6.2,
    "baseRows": 2,
    "shiftStartY": 39.5,
}
LEGACY_MANAGED_FIELD_IDS = {
    "field-serial",
    "field-date",
    "field-time",
    "field-vehicle",
    "field-customer",
    "field-material",
    "field-charge",
}

BASE_PRINTER_FIELD_OPTIONS = [
    ("", "Blank", "General"),
    ("serialNo", "S.No", "Ticket"),
    ("refNo", "Ref No", "Ticket"),
    ("entryDate", "Entry Date", "Ticket"),
    ("entryTime", "Entry Time", "Ticket"),
    ("vehicleNo", "Vehicle No", "Vehicle"),
    ("weighingType", "Weighing Type", "Vehicle"),
    ("material", "Material", "Vehicle"),
    ("customer", "Party / Customer", "Vehicle"),
    ("mobileNo", "Mobile No", "Vehicle"),
    ("paymentMode", "Payment Mode", "Charges"),
    ("charges", "Charges", "Charges"),
    ("grossWeight", "1st Weight / Gross Weight", "Weight"),
    ("grossDate", "1st Weight Date", "Weight"),
    ("grossTime", "1st Weight Time", "Weight"),
    ("tareWeight", "2nd Weight / Tare Weight", "Weight"),
    ("tareDate", "2nd Weight Date", "Weight"),
    ("tareTime", "2nd Weight Time", "Weight"),
    ("netWeight", "Net Weight", "Weight"),
]
PHOTO_SOURCE_OPTIONS = [
    {"key": "", "label": "Blank"},
    *[
        {
            "key": f"camera:{camera_no}",
            "label": f"Camera {camera_no} Photo",
        }
        for camera_no in WEIGHMENT_CAMERA_IMAGE_COLUMNS
    ],
]
FONT_WEIGHT_OPTIONS = [400, 500, 600, 700, 800, 900, 1000]
FONT_FAMILY_OPTIONS = {
    "Dot Matrix Draft",
    "FS Blok",
    "Times New Roman",
    "Arial",
    "Calibri",
    "Courier New",
    "Georgia",
    "Verdana",
    "Tahoma",
    "Trebuchet MS",
    "Garamond",
    "Consolas",
    "Lucida Console",
}
DEFAULT_DOT_MATRIX_FONT_FAMILY = "Dot Matrix Draft"
ALIGN_OPTIONS = {"left", "center", "right"}
FIT_OPTIONS = {"contain", "cover"}
ELEMENT_KIND_OPTIONS = {"staticText", "field", "weight", "image", "photo", "printBreak"}
BASE_TEMPLATE_REMOVABLE_FIELD_SOURCES = {"entryDate", "entryTime"}
BASE_TEMPLATE_EDITABLE_ELEMENT_PROPERTIES = {
    "field": {"valueFontSize"},
    "weight": {"valueFontSize", "metaFontSize", "showWeightValue"},
}


def format_field_label(value):
    return str(value or "").replace("_", " ").title()


def clone_layout(layout):
    return json.loads(json.dumps(layout or {}))


def normalize_printer_type(value, fallback=DEFAULT_PRINTER_TYPE):
    normalized = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    return normalized if normalized in PRINTER_TYPE_CONFIG else fallback


def normalize_layout_name(value, fallback=""):
    name = " ".join(str(value or "").split())[:MAX_PRINTER_LAYOUT_NAME_LENGTH]
    return name or fallback


def printer_type_config(printer_type):
    return PRINTER_TYPE_CONFIG[normalize_printer_type(printer_type)]


def printer_type_limits(printer_type):
    return printer_type_config(printer_type)["limits"]


def printer_type_label(printer_type):
    return printer_type_config(printer_type)["label"]


def default_template_name_for_printer_type(printer_type):
    return PRINTER_TYPE_DEFAULT_TEMPLATE_NAMES.get(
        normalize_printer_type(printer_type),
        PRINTER_LAYOUT_NAME,
    )


def base_template_requires_restricted_editing(layout_name, printer_type=None):
    return False


def infer_printer_type(layout=None, layout_name=""):
    if isinstance(layout, dict):
        printer_type = normalize_printer_type(layout.get("printerType"), "")
        if printer_type:
            return printer_type

    normalized_name = normalize_layout_name(layout_name).casefold()
    for printer_type, default_name in PRINTER_TYPE_DEFAULT_TEMPLATE_NAMES.items():
        if normalized_name == default_name.casefold():
            return printer_type

    return DEFAULT_PRINTER_TYPE


def serialize_printer_types():
    return [
        {
            "key": option["key"],
            "label": option["label"],
            "description": option["description"],
            "defaultTemplateName": default_template_name_for_printer_type(option["key"]),
            "pageDefaults": option["page"],
            "limits": option["limits"],
        }
        for option in PRINTER_TYPE_OPTIONS
    ]


def printer_field_options(custom_columns):
    options = [
        {"key": key, "label": label, "group": group}
        for key, label, group in BASE_PRINTER_FIELD_OPTIONS
    ]
    options.extend(
        {
            "key": f"custom:{column}",
            "label": format_field_label(column),
            "group": "Custom Fields",
        }
        for column in custom_columns
    )
    return options




def default_thermal_info_rows():
    return [
        {
            "id": "thermal-info-row-1",
            "fields": [
                {"id": "thermal-info-row-1-field-1", "label": "S.No.", "source": "serialNo", "fontSize": 8},
            ],
        },
        {
            "id": "thermal-info-row-2",
            "fields": [
                {"id": "thermal-info-row-2-field-1", "label": "Vehicle No.", "source": "vehicleNo", "fontSize": 8},
            ],
        },
        {
            "id": "thermal-info-row-3",
            "fields": [
                {"id": "thermal-info-row-3-field-1", "label": "Party", "source": "customer", "fontSize": 8},
            ],
        },
    ]


def default_thermal_weight_rows():
    return [
        {
            "id": "thermal-weight-row-1",
            "fields": [
                {"id": "thermal-weight-row-1-field-1", "label": "Gross Weight", "source": "grossWeight", "fontSize": 8},
            ],
        },
        {
            "id": "thermal-weight-row-2",
            "fields": [
                {"id": "thermal-weight-row-2-field-1", "label": "Tare Weight", "source": "tareWeight", "fontSize": 8},
            ],
        },
        {
            "id": "thermal-weight-row-3",
            "fields": [
                {"id": "thermal-weight-row-3-field-1", "label": "Net Weight", "source": "netWeight", "fontSize": 8},
            ],
        },
    ]


def default_thermal_receipt_rows():
    return [
        *default_thermal_info_rows(),
        *default_thermal_weight_rows(),
    ]




def legacy_field_rows_from_elements(elements):
    by_id = {
        item.get("id"): item
        for item in elements or []
        if isinstance(item, dict) and item.get("id") in LEGACY_MANAGED_FIELD_IDS
    }
    if not by_id:
        return default_field_rows()

    rows = [
        {
            "id": "row-1",
            "fields": [
                {"id": "row-1-field-1", "label": by_id.get("field-serial", {}).get("label", "S.No."), "source": by_id.get("field-serial", {}).get("source", "serialNo")},
                {"id": "row-1-field-2", "label": by_id.get("field-date", {}).get("label", "Date"), "source": by_id.get("field-date", {}).get("source", "entryDate")},
                {"id": "row-1-field-3", "label": by_id.get("field-time", {}).get("label", "Time"), "source": by_id.get("field-time", {}).get("source", "entryTime")},
                {"id": "row-1-field-4", "label": by_id.get("field-vehicle", {}).get("label", "Vehicle No."), "source": by_id.get("field-vehicle", {}).get("source", "vehicleNo")},
            ],
        },
        {
            "id": "row-2",
            "fields": [
                {"id": "row-2-field-1", "label": by_id.get("field-customer", {}).get("label", "Party"), "source": by_id.get("field-customer", {}).get("source", "customer")},
                {"id": "row-2-field-2", "label": by_id.get("field-material", {}).get("label", "Material"), "source": by_id.get("field-material", {}).get("source", "material")},
                {"id": "row-2-field-3", "label": by_id.get("field-charge", {}).get("label", "Amount Rs."), "source": by_id.get("field-charge", {}).get("source", "charges")},
            ],
        },
    ]
    return rows




def default_thermal_printer_layout():
    border = HEX_COLOR_DEFAULTS["pageBorder"]
    heading = "#000000"
    accent = "#000000"
    receipt_rows = default_thermal_receipt_rows()

    return {
        "version": PRINTER_LAYOUT_VERSION,
        "printerType": "thermal",
        "page": {
            "widthMm": 80.0,
            "heightMm": 80.0,
            "backgroundColor": HEX_COLOR_DEFAULTS["pageBackground"],
            "borderColor": HEX_COLOR_DEFAULTS["pageBackground"],
            "borderWidth": 1,
        },
        "fieldRowsSettings": {
            "x": 6.0,
            "y": 23.0,
            "w": 88.0,
            "rowHeight": 5.5,
            "baseRows": 6,
            "shiftStartY": 58.0,
        },
        "fieldRows": receipt_rows,
        "managedSections": [
            {
                "id": "thermal-receipt",
                "name": "Receipt Fields",
                "groupId": "thermal-receipt-stack",
                "x": 6.0,
                "y": 23.0,
                "w": 88.0,
                "rowHeight": 5.5,
                "baseRows": 6,
                "shiftStartY": 58.0,
                "rows": receipt_rows,
            },
        ],
        "elements": [
            {
                "id": "thermal-company-name",
                "kind": "staticText",
                "name": "Company Name",
                "x": 6.0,
                "y": 4.0,
                "w": 88.0,
                "h": 6.0,
                "text": "WEIGHBRIDGE",
                "fontSize": 10,
                "fontWeight": 500,
                "textColor": accent,
                "backgroundColor": "transparent",
                "borderColor": "transparent",
                "borderWidth": 0,
                "radius": 0,
                "padding": 0,
                "align": "center",
                "fit": "contain",
            },
            {
                "id": "thermal-address-line-1",
                "kind": "staticText",
                "name": "Address Line 1",
                "x": 6.0,
                "y": 10.5,
                "w": 88.0,
                "h": 3.6,
                "text": "Address Line 1",
                "fontSize": 8,
                "fontWeight": 400,
                "textColor": heading,
                "backgroundColor": "transparent",
                "borderColor": "transparent",
                "borderWidth": 0,
                "radius": 0,
                "padding": 0,
                "align": "center",
                "fit": "contain",
            },
            {
                "id": "thermal-address-line-2",
                "kind": "staticText",
                "name": "Address Line 2",
                "x": 6.0,
                "y": 14.4,
                "w": 88.0,
                "h": 3.6,
                "text": "Address Line 2",
                "fontSize": 8,
                "fontWeight": 400,
                "textColor": heading,
                "backgroundColor": "transparent",
                "borderColor": "transparent",
                "borderWidth": 0,
                "radius": 0,
                "padding": 0,
                "align": "center",
                "fit": "contain",
            },
            {
                "id": "thermal-operator-sign",
                "kind": "staticText",
                "name": "Operator Sign",
                "x": 6.0,
                "y": 59.5,
                "w": 40.0,
                "h": 5.0,
                "text": "Operator Sign",
                "fontSize": 8,
                "fontWeight": 400,
                "textColor": heading,
                "backgroundColor": "transparent",
                "borderColor": "transparent",
                "borderWidth": 0,
                "radius": 0,
                "padding": 0,
                "align": "left",
                "fit": "contain",
            },
            {
                "id": "thermal-thanks",
                "kind": "staticText",
                "name": "Thank You",
                "x": 6.0,
                "y": 64.0,
                "w": 88.0,
                "h": 4.0,
                "text": "Thank You",
                "fontSize": 8,
                "fontWeight": 400,
                "textColor": accent,
                "backgroundColor": "transparent",
                "borderColor": "transparent",
                "borderWidth": 0,
                "radius": 0,
                "padding": 0,
                "align": "center",
                "fit": "contain",
            },
            {
                "id": "thermal-visit-again",
                "kind": "staticText",
                "name": "Visit Again",
                "x": 6.0,
                "y": 68.5,
                "w": 88.0,
                "h": 3.0,
                "text": "Visit Again",
                "fontSize": 8,
                "fontWeight": 400,
                "textColor": heading,
                "backgroundColor": "transparent",
                "borderColor": "transparent",
                "borderWidth": 0,
                "radius": 0,
                "padding": 0,
                "align": "center",
                "fit": "contain",
            },
        ],
    }




def normalize_text(value, fallback="", *, max_length=160):
    if value is None:
        return fallback
    return " ".join(str(value).split())[:max_length]


def normalize_float(value, fallback, minimum, maximum, precision=2):
    try:
        numeric = round(float(value), precision)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, numeric))


def normalize_int(value, fallback, minimum, maximum):
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, numeric))


def normalize_color(value, fallback, *, allow_transparent=False):
    if isinstance(value, str):
        stripped = value.strip()
        if allow_transparent and stripped.lower() == "transparent":
            return "transparent"
        if len(stripped) == 7 and stripped.startswith("#"):
            try:
                int(stripped[1:], 16)
                return stripped.upper()
            except ValueError:
                pass
    return fallback


def normalize_optional_color(value):
    if not isinstance(value, str):
        return ""
    stripped = value.strip()
    if len(stripped) == 7 and stripped.startswith("#"):
        try:
            int(stripped[1:], 16)
            return stripped.upper()
        except ValueError:
            return ""
    return ""


def normalize_alignment(value, fallback):
    return value if value in ALIGN_OPTIONS else fallback


def normalize_fit(value, fallback):
    return value if value in FIT_OPTIONS else fallback


def normalize_font_family(value, fallback=DEFAULT_DOT_MATRIX_FONT_FAMILY):
    normalized = normalize_text(value, fallback, max_length=60)
    return normalized if normalized in FONT_FAMILY_OPTIONS else fallback


def normalize_page_orientation(value, width_mm=None, height_mm=None):
    normalized = str(value or "").strip().lower()
    if normalized in {"portrait", "landscape"}:
        return normalized

    try:
        width = float(width_mm)
        height = float(height_mm)
    except (TypeError, ValueError):
        return "landscape"

    return "portrait" if height > width else "landscape"


def normalize_font_weight(value, fallback):
    return value if value in FONT_WEIGHT_OPTIONS else fallback


def normalize_kind(value, fallback):
    return value if value in ELEMENT_KIND_OPTIONS else fallback


def normalize_field_row_field(field, valid_field_keys, row_index, field_index):
    fallback_id = f"row-{row_index + 1}-field-{field_index + 1}"
    raw_col = field.get("col")
    normalized_col = None
    if isinstance(raw_col, (int, float)) and not isinstance(raw_col, bool):
        normalized_col = max(0, min(300, int(raw_col)))
    common = {
        "id": normalize_text(field.get("id"), fallback_id, max_length=60) or fallback_id,
        "col": normalized_col,
        "fontSize": normalize_int(field.get("fontSize"), 8, 6, 18),
        "cpi": normalize_int(field.get("cpi"), 10, 5, 20),
        "fontFamily": normalize_font_family(field.get("fontFamily"), DEFAULT_DOT_MATRIX_FONT_FAMILY),
        "textColor": normalize_optional_color(field.get("textColor")),
    }

    if str(field.get("kind", "")) == "text":
        return {
            **common,
            "kind": "text",
            "label": "",
            "source": "",
            "text": normalize_text(field.get("text"), "", max_length=120),
        }

    fallback_key = next((key for key in valid_field_keys if key), "serialNo")
    label_fallback = format_field_label(fallback_key) if fallback_key else f"Field {field_index + 1}"
    source = field.get("source")
    normalized_source = source if source in valid_field_keys else fallback_key
    return {
        **common,
        "kind": "data",
        # An explicitly empty label (user cleared it to print the value alone)
        # must be preserved as "" — only a genuinely absent label falls back.
        "label": normalize_text(field.get("label"), label_fallback, max_length=60),
        "source": normalized_source,
        "text": "",
    }


def normalize_field_rows(rows, defaults, valid_field_keys):
    normalized_rows = []
    provided_rows = rows
    rows = rows if isinstance(rows, list) else defaults

    for row_index, row in enumerate(rows[:MAX_FIELD_ROWS]):
        if not isinstance(row, dict):
            continue
        fields = row.get("fields") if isinstance(row.get("fields"), list) else []
        normalized_fields = [
            normalize_field_row_field(field, valid_field_keys, row_index, field_index)
            for field_index, field in enumerate(fields[:MAX_FIELDS_PER_ROW])
            if isinstance(field, dict)
        ]
        normalized_rows.append({
            "id": normalize_text(row.get("id"), f"row-{row_index + 1}", max_length=60) or f"row-{row_index + 1}",
            "fields": normalized_fields,
        })

    if normalized_rows:
        return normalized_rows
    if isinstance(provided_rows, list):
        return []
    return defaults


def normalize_managed_section(section, defaults, valid_field_keys, index):
    section = section if isinstance(section, dict) else {}
    default_id = defaults.get("id") or f"managed-section-{index + 1}"
    default_name = defaults.get("name") or f"Field Section {index + 1}"
    return {
        "id": normalize_text(section.get("id"), default_id, max_length=60) or default_id,
        "name": normalize_text(section.get("name"), default_name, max_length=60) or default_name,
        "groupId": normalize_text(section.get("groupId"), defaults.get("groupId", ""), max_length=60),
        "x": normalize_float(section.get("x"), defaults["x"], 0, 100, precision=2),
        "y": normalize_float(section.get("y"), defaults["y"], 0, 10000, precision=2),
        "w": normalize_float(section.get("w"), defaults["w"], 20, 100, precision=2),
        "rowHeight": normalize_float(section.get("rowHeight"), defaults["rowHeight"], 4, 12, precision=2),
        "baseRows": normalize_int(section.get("baseRows"), defaults["baseRows"], 0, MAX_FIELD_ROWS),
        "shiftStartY": normalize_float(section.get("shiftStartY"), defaults["shiftStartY"], 0, 10000, precision=2),
        "rows": normalize_field_rows(section.get("rows"), defaults["rows"], valid_field_keys),
    }


def normalize_managed_sections(sections, defaults, valid_field_keys):
    defaults = defaults if isinstance(defaults, list) and defaults else [
        {
            "id": "main-field-rows",
            "name": "Field Rows",
            "x": FIELD_ROWS_SECTION_DEFAULTS["x"],
            "y": FIELD_ROWS_SECTION_DEFAULTS["y"],
            "w": FIELD_ROWS_SECTION_DEFAULTS["w"],
            "rowHeight": FIELD_ROWS_SECTION_DEFAULTS["rowHeight"],
            "baseRows": FIELD_ROWS_SECTION_DEFAULTS["baseRows"],
            "shiftStartY": FIELD_ROWS_SECTION_DEFAULTS["shiftStartY"],
            "rows": default_field_rows(),
        },
    ]

    if not isinstance(sections, list):
        sections = defaults

    normalized_sections = []
    for index, section in enumerate(sections[:MAX_FIELD_ROWS]):
        if not isinstance(section, dict):
            continue
        fallback = defaults[min(index, len(defaults) - 1)]
        normalized_sections.append(
            normalize_managed_section(section, fallback, valid_field_keys, index)
        )

    if normalized_sections:
        return normalized_sections

    return [
        normalize_managed_section(defaults[0], defaults[0], valid_field_keys, 0)
    ]


def default_element_for_kind(kind, index=0):
    defaults = {
        "staticText": {
            "kind": "staticText",
            "name": f"Text {index + 1}",
            "text": "New Text",
            "label": "",
            "title": "",
            "source": "",
            "imageUrl": "",
            "unit": "",
            "x": 10.0,
            "y": 10.0,
            "w": 20.0,
            "h": 6.0,
            "fontSize": 14,
            "valueFontSize": 18,
            "fontWeight": 800,
            "fontFamily": DEFAULT_DOT_MATRIX_FONT_FAMILY,
            "textColor": HEX_COLOR_DEFAULTS["text"],
            "backgroundColor": "transparent",
            "borderColor": "transparent",
            "borderWidth": 0,
            "radius": 0,
            "padding": 2,
            "align": "left",
            "fit": "contain",
            "z": index + 1,
        },
        "field": {
            "kind": "field",
            "name": f"Field {index + 1}",
            "text": "",
            "label": "New Field",
            "title": "",
            "source": "serialNo",
            "imageUrl": "",
            "unit": "",
            "x": 10.0,
            "y": 10.0,
            "w": 24.0,
            "h": 8.0,
            "fontSize": 13,
            "valueFontSize": 14,
            "fontWeight": 800,
            "fontFamily": DEFAULT_DOT_MATRIX_FONT_FAMILY,
            "textColor": HEX_COLOR_DEFAULTS["heading"],
            "backgroundColor": "transparent",
            "borderColor": HEX_COLOR_DEFAULTS["pageBorder"],
            "borderWidth": 1,
            "radius": 0,
            "padding": 2,
            "align": "left",
            "fit": "contain",
            "z": index + 1,
        },
        "printBreak": {
            "kind": "printBreak",
            "name": f"Print Break {index + 1}",
            "text": "PRINT BREAK",
            "label": "",
            "title": "",
            "source": "",
            "imageUrl": "",
            "unit": "",
            "x": 0.0,
            "y": 90.0,
            "w": 100.0,
            "h": 2.0,
            "fontSize": 10,
            "valueFontSize": 10,
            "fontWeight": 800,
            "fontFamily": DEFAULT_DOT_MATRIX_FONT_FAMILY,
            "textColor": "#C026D3",
            "backgroundColor": "transparent",
            "borderColor": "#C026D3",
            "borderWidth": 1,
            "radius": 0,
            "padding": 0,
            "align": "center",
            "fit": "contain",
            "z": index + 1,
        },
        "weight": {
            "kind": "weight",
            "name": f"Weight Box {index + 1}",
            "text": "",
            "label": "Weight",
            "title": "",
            "source": "grossWeight",
            "imageUrl": "",
            "unit": "kg",
            "x": 10.0,
            "y": 10.0,
            "w": 24.0,
            "h": 14.0,
            "fontSize": 12,
            "valueFontSize": 26,
            "showWeightValue": True,
            "metaSources": [],
            "metaFontSize": 8,
            "fontWeight": 900,
            "fontFamily": DEFAULT_DOT_MATRIX_FONT_FAMILY,
            "textColor": HEX_COLOR_DEFAULTS["heading"],
            "backgroundColor": "transparent",
            "borderColor": HEX_COLOR_DEFAULTS["pageBorder"],
            "borderWidth": 1,
            "radius": 0,
            "padding": 1,
            "align": "center",
            "fit": "contain",
            "z": index + 1,
        },
        "image": {
            "kind": "image",
            "name": f"Image {index + 1}",
            "text": "",
            "label": "",
            "title": "",
            "source": "",
            "imageUrl": "",
            "unit": "",
            "x": 10.0,
            "y": 10.0,
            "w": 14.0,
            "h": 14.0,
            "fontSize": 14,
            "valueFontSize": 14,
            "fontWeight": 800,
            "fontFamily": DEFAULT_DOT_MATRIX_FONT_FAMILY,
            "textColor": HEX_COLOR_DEFAULTS["heading"],
            "backgroundColor": "transparent",
            "borderColor": HEX_COLOR_DEFAULTS["pageBorder"],
            "borderWidth": 1,
            "radius": 4,
            "padding": 2,
            "align": "center",
            "fit": "contain",
            "z": index + 1,
        },
        "photo": {
            "kind": "photo",
            "name": f"Photo {index + 1}",
            "text": "",
            "label": "",
            "title": "Photo",
            "source": "camera:1",
            "imageUrl": "",
            "unit": "",
            "x": 10.0,
            "y": 10.0,
            "w": 28.0,
            "h": 24.0,
            "fontSize": 10,
            "valueFontSize": 14,
            "fontWeight": 800,
            "fontFamily": DEFAULT_DOT_MATRIX_FONT_FAMILY,
            "textColor": HEX_COLOR_DEFAULTS["heading"],
            "backgroundColor": "transparent",
            "borderColor": HEX_COLOR_DEFAULTS["pageBorder"],
            "borderWidth": 1,
            "radius": 0,
            "padding": 1,
            "align": "center",
            "fit": "cover",
            "z": index + 1,
        },
    }
    return defaults[kind].copy()


def normalize_element(element, valid_field_keys, valid_photo_keys, index):
    raw_kind = element.get("kind")
    kind = normalize_kind(raw_kind, "staticText")
    defaults = default_element_for_kind(kind, index)

    if kind in {"field", "weight"}:
        source = element.get("source")
        normalized_source = source if source in valid_field_keys else defaults["source"]
    elif kind == "photo":
        source = element.get("source")
        normalized_source = source if source in valid_photo_keys else defaults["source"]
    else:
        normalized_source = ""

    normalized_width = normalize_float(element.get("w"), defaults["w"], 2, 100, precision=2)
    normalized_height = normalize_float(element.get("h"), defaults["h"], 2, 100, precision=2)
    normalized_x = normalize_float(element.get("x"), defaults["x"], 0, 100 - normalized_width, precision=2)
    normalized_y = normalize_float(element.get("y"), defaults["y"], 0, 100 - normalized_height, precision=2)

    return {
        "id": normalize_text(element.get("id"), f"element-{index + 1}", max_length=60) or f"element-{index + 1}",
        "kind": kind,
        "name": normalize_text(element.get("name"), defaults["name"], max_length=60) or defaults["name"],
        "text": normalize_text(element.get("text"), defaults["text"], max_length=240),
        "label": normalize_text(element.get("label"), defaults["label"], max_length=80),
        "title": normalize_text(element.get("title"), defaults["title"], max_length=80),
        "source": normalized_source,
        "imageUrl": normalize_text(element.get("imageUrl"), defaults["imageUrl"], max_length=255),
        "unit": normalize_text(element.get("unit"), defaults["unit"], max_length=12),
        "x": normalized_x,
        "y": normalized_y,
        "w": normalized_width,
        "h": normalized_height,
        "fontSize": normalize_int(element.get("fontSize"), defaults["fontSize"], 8, 48),
        "valueFontSize": normalize_int(element.get("valueFontSize"), defaults["valueFontSize"], 8, 72),
        "showWeightValue": element.get("showWeightValue") is not False,
        "metaSources": [
            source
            for source in (
                element.get("metaSources")
                if isinstance(element.get("metaSources"), list)
                else defaults.get("metaSources", [])
            )
            if source in valid_field_keys
        ][:2],
        "metaFontSize": normalize_int(
            element.get("metaFontSize"),
            defaults.get("metaFontSize", 8),
            6,
            18,
        ),
        "fontWeight": normalize_font_weight(element.get("fontWeight"), defaults["fontWeight"]),
        "fontFamily": normalize_font_family(element.get("fontFamily"), defaults["fontFamily"]),
        "textColor": normalize_color(element.get("textColor"), defaults["textColor"]),
        "backgroundColor": normalize_color(
            element.get("backgroundColor"),
            defaults["backgroundColor"],
            allow_transparent=True,
        ),
        "borderColor": normalize_color(
            element.get("borderColor"),
            defaults["borderColor"],
            allow_transparent=True,
        ),
        "borderWidth": normalize_int(element.get("borderWidth"), defaults["borderWidth"], 0, 6),
        "radius": normalize_int(element.get("radius"), defaults["radius"], 0, 24),
        "padding": normalize_int(element.get("padding"), defaults["padding"], 0, 20),
        "align": normalize_alignment(element.get("align"), defaults["align"]),
        "fit": normalize_fit(element.get("fit"), defaults["fit"]),
        "z": normalize_int(element.get("z"), defaults["z"], 1, 999),
    }






def normalize_printer_layout(layout, custom_columns, fallback_printer_type=DEFAULT_PRINTER_TYPE):
    layout = layout if isinstance(layout, dict) else {}
    printer_type = normalize_printer_type(
        layout.get("printerType"),
        normalize_printer_type(fallback_printer_type),
    )
    defaults = default_printer_layout(printer_type)
    limits = printer_type_limits(printer_type)
    layout = layout if isinstance(layout, dict) else {}
    page = layout.get("page") if isinstance(layout.get("page"), dict) else {}
    field_rows_settings = layout.get("fieldRowsSettings") if isinstance(layout.get("fieldRowsSettings"), dict) else {}
    managed_sections = layout.get("managedSections") if isinstance(layout.get("managedSections"), list) else None
    has_explicit_elements = isinstance(layout.get("elements"), list)
    elements = layout.get("elements") if has_explicit_elements else defaults["elements"]
    valid_field_keys = {option["key"] for option in printer_field_options(custom_columns)}
    valid_photo_keys = {option["key"] for option in PHOTO_SOURCE_OPTIONS}
    field_rows = layout.get("fieldRows")
    if not isinstance(field_rows, list):
        field_rows = legacy_field_rows_from_elements(elements)

    if managed_sections is None:
        managed_sections = [
            {
                "id": defaults["managedSections"][0]["id"],
                "name": defaults["managedSections"][0]["name"],
                "x": field_rows_settings.get("x", defaults["fieldRowsSettings"]["x"]),
                "y": field_rows_settings.get("y", defaults["fieldRowsSettings"]["y"]),
                "w": field_rows_settings.get("w", defaults["fieldRowsSettings"]["w"]),
                "rowHeight": field_rows_settings.get("rowHeight", defaults["fieldRowsSettings"]["rowHeight"]),
                "baseRows": field_rows_settings.get("baseRows", defaults["fieldRowsSettings"]["baseRows"]),
                "shiftStartY": field_rows_settings.get("shiftStartY", defaults["fieldRowsSettings"]["shiftStartY"]),
                "rows": field_rows,
            },
        ]

    normalized_elements = [
        normalize_element(item, valid_field_keys, valid_photo_keys, index)
        for index, item in enumerate(elements[:MAX_LAYOUT_ELEMENTS])
        if isinstance(item, dict)
        and item.get("id") not in LEGACY_MANAGED_FIELD_IDS
        and not (
            printer_type == "dot_matrix"
            and item.get("kind") in {"image", "photo"}
        )
    ]
    if not normalized_elements and not has_explicit_elements:
        normalized_elements = [
            normalize_element(item, valid_field_keys, valid_photo_keys, index)
            for index, item in enumerate(defaults["elements"])
            if item.get("id") not in LEGACY_MANAGED_FIELD_IDS
        ]
    if printer_type == "dot_matrix":
        normalized_elements = expand_dot_matrix_full_width_elements(normalized_elements)

    normalized_sections = normalize_managed_sections(
        managed_sections,
        defaults.get("managedSections"),
        valid_field_keys,
    )
    if printer_type == "dot_matrix":
        normalized_sections = expand_dot_matrix_full_width_sections(normalized_sections)
    primary_section = normalized_sections[0]

    return {
        "version": PRINTER_LAYOUT_VERSION,
        "templateKind": normalize_text(layout.get("templateKind"), "", max_length=40),
        "printerType": printer_type,
        "page": {
            "widthMm": normalize_float(page.get("widthMm"), defaults["page"]["widthMm"], limits["minWidthMm"], limits["maxWidthMm"], precision=1),
            "heightMm": normalize_float(page.get("heightMm"), defaults["page"]["heightMm"], limits["minHeightMm"], limits["maxHeightMm"], precision=1),
            "orientation": normalize_page_orientation(
                page.get("orientation"),
                page.get("widthMm"),
                page.get("heightMm"),
            ),
            "backgroundColor": normalize_color(page.get("backgroundColor"), defaults["page"]["backgroundColor"]),
            "borderColor": normalize_color(page.get("borderColor"), defaults["page"]["borderColor"]),
            "borderWidth": normalize_int(page.get("borderWidth"), defaults["page"]["borderWidth"], 0, 6),
        },
        "fieldRowsSettings": {
            "x": primary_section["x"],
            "y": primary_section["y"],
            "w": primary_section["w"],
            "rowHeight": primary_section["rowHeight"],
            "baseRows": primary_section["baseRows"],
            "shiftStartY": primary_section["shiftStartY"],
        },
        "fieldRows": primary_section["rows"],
        "managedSections": normalized_sections,
        "elements": normalized_elements,
        "defaults": {
            "fontFamily": normalize_font_family(
                (layout.get("defaults") or {}).get("fontFamily")
                if isinstance(layout.get("defaults"), dict)
                else None,
                defaults.get("defaults", {}).get("fontFamily", DEFAULT_DOT_MATRIX_FONT_FAMILY),
            ),
        } if printer_type == "dot_matrix" else {},
        "rawBlockPositions": {
            str(block_id): normalize_int(line_no, 1, 1, DOT_MATRIX_RAW_MAX_LINES)
            for block_id, line_no in (layout.get("rawBlockPositions") if isinstance(layout.get("rawBlockPositions"), dict) else {}).items()
            if isinstance(block_id, str) and isinstance(line_no, (int, float)) and not isinstance(line_no, bool)
        } if printer_type == "dot_matrix" else {},
        "rawHeaderText": {
            key: normalize_text(
                (layout.get("rawHeaderText") or {}).get(key) if isinstance(layout.get("rawHeaderText"), dict) else None,
                "",
                max_length=160,
            )
            for key in (
                "companyName", "companySubtitle", "companyContact", "docTitle", "remarksText",
                "leftSign", "rightSign", "grossLabel", "tareLabel", "netLabel",
            )
        } if printer_type == "dot_matrix" else {},
        # None = unspecified on regular template, meaning "all enabled".
        # For blank_canvas templates, unspecified defaults to [] (nothing enabled).
        "rawStructuralBlocks": (
            [
                str(block_id) for block_id in layout.get("rawStructuralBlocks")
                if block_id in DOT_MATRIX_OPTIONAL_STRUCTURAL_BLOCKS
            ]
            if isinstance(layout.get("rawStructuralBlocks"), list)
            else ([] if layout.get("templateKind") == "blank_canvas" else None)
        ) if printer_type == "dot_matrix" else None,
    }


def validate_base_template_rows(existing_rows, requested_rows):
    if len(existing_rows) != len(requested_rows):
        return "Default templates only allow removing the top date/time fields"

    for existing_row, requested_row in zip(existing_rows, requested_rows):
        if existing_row.get("id") != requested_row.get("id"):
            return "Default templates only allow removing the top date/time fields"

        existing_fields = existing_row.get("fields") or []
        requested_fields = requested_row.get("fields") or []
        existing_by_id = {
            field.get("id"): field
            for field in existing_fields
            if isinstance(field, dict) and field.get("id")
        }

        existing_index = 0
        for requested_field in requested_fields:
            requested_id = requested_field.get("id")
            matched = False

            while existing_index < len(existing_fields):
                existing_field = existing_fields[existing_index]
                existing_index += 1
                if existing_field.get("id") != requested_id:
                    if existing_field.get("source") not in BASE_TEMPLATE_REMOVABLE_FIELD_SOURCES:
                        return "Default templates only allow removing the top date/time fields"
                    continue

                if requested_field != existing_field:
                    return "Default templates only allow removing the top date/time fields"

                matched = True
                break

            if not matched:
                return "Default templates only allow removing the top date/time fields"

        for remaining_field in existing_fields[existing_index:]:
            if remaining_field.get("source") not in BASE_TEMPLATE_REMOVABLE_FIELD_SOURCES:
                return "Default templates only allow removing the top date/time fields"

        unknown_ids = {
            field.get("id")
            for field in requested_fields
            if field.get("id") not in existing_by_id
        }
        if unknown_ids:
            return "Default templates only allow removing the top date/time fields"

    return None


def validate_base_template_sections(existing_sections, requested_sections):
    if len(existing_sections) != len(requested_sections):
        return "Default templates only allow removing the top date/time fields"

    section_properties = ("id", "name", "groupId", "x", "y", "w", "rowHeight", "baseRows", "shiftStartY")
    for existing_section, requested_section in zip(existing_sections, requested_sections):
        if any(existing_section.get(prop) != requested_section.get(prop) for prop in section_properties):
            return "Default templates only allow removing the top date/time fields"

        error = validate_base_template_rows(
            existing_section.get("rows") or [],
            requested_section.get("rows") or [],
        )
        if error:
            return error

    return None


def validate_base_template_elements(existing_elements, requested_elements):
    if len(existing_elements) != len(requested_elements):
        return "Default templates only allow font-size changes for value and date/time"

    requested_by_id = {
        element.get("id"): element
        for element in requested_elements
        if isinstance(element, dict) and element.get("id")
    }
    if len(requested_by_id) != len(requested_elements):
        return "Default templates only allow font-size changes for value and date/time"

    for existing_element in existing_elements:
        element_id = existing_element.get("id")
        requested_element = requested_by_id.get(element_id)
        if requested_element is None:
            return "Default templates only allow font-size changes for value and date/time"

        allowed_properties = BASE_TEMPLATE_EDITABLE_ELEMENT_PROPERTIES.get(
            existing_element.get("kind"),
            set(),
        )
        all_properties = set(existing_element.keys()) | set(requested_element.keys())
        for property_name in all_properties:
            if property_name in allowed_properties:
                continue
            if existing_element.get(property_name) != requested_element.get(property_name):
                return "Default templates only allow font-size changes for value and date/time"

    return None


def validate_base_template_update(existing_layout, requested_layout):
    if existing_layout.get("printerType") != requested_layout.get("printerType"):
        return "Default templates cannot change printer type"
    if existing_layout.get("page") != requested_layout.get("page"):
        return "Default templates cannot change page settings"
    if existing_layout.get("fieldRowsSettings") != requested_layout.get("fieldRowsSettings"):
        return "Default templates cannot change row layout settings"

    section_error = validate_base_template_sections(
        existing_layout.get("managedSections") or [],
        requested_layout.get("managedSections") or [],
    )
    if section_error:
        return section_error

    element_error = validate_base_template_elements(
        existing_layout.get("elements") or [],
        requested_layout.get("elements") or [],
    )
    if element_error:
        return element_error

    if requested_layout.get("fieldRows") != (requested_layout.get("managedSections") or [{}])[0].get("rows", []):
        return "Default templates only allow removing the top date/time fields"

    return None


def layout_matches_signature(layout, *, expected_version, field_rows_signature, element_signature, missing_ids=(), tolerance=0.05):
    if not isinstance(layout, dict):
        return False

    if layout.get("version") != expected_version:
        return False

    field_rows_settings = layout.get("fieldRowsSettings") if isinstance(layout.get("fieldRowsSettings"), dict) else {}
    for property_name, expected_value in field_rows_signature.items():
        try:
            numeric_value = float(field_rows_settings.get(property_name, -999))
        except (TypeError, ValueError):
            return False
        if abs(numeric_value - float(expected_value)) > tolerance:
            return False

    by_id = {
        item.get("id"): item
        for item in layout.get("elements", [])
        if isinstance(item, dict) and item.get("id")
    }

    for missing_id in missing_ids:
        if missing_id in by_id:
            return False

    for element_id, property_name, expected_value in element_signature:
        element = by_id.get(element_id)
        if element is None:
            return False
        try:
            numeric_value = float(element.get(property_name))
        except (TypeError, ValueError):
            return False
        if abs(numeric_value - float(expected_value)) > tolerance:
            return False

    return True


def is_legacy_default_layout(layout):
    if layout_matches_signature(
        layout,
        expected_version=2,
        field_rows_signature={"x": 0.0, "w": 100.0},
        element_signature=(
            ("logo", "x", 1.2),
            ("company-name", "x", 11.4),
            ("photo-1", "x", 10.0),
            ("photo-2", "x", 46.0),
            ("weight-1", "x", 0.0),
            ("signature", "x", 82.0),
            ("footer-note", "x", 0.0),
            ("footer-thanks", "x", 60.0),
        ),
        tolerance=0.25,
    ):
        return True

    if layout_matches_signature(
        layout,
        expected_version=3,
        field_rows_signature={"x": 2.0, "w": 96.0},
        element_signature=(
            ("logo", "x", 2.0),
            ("company-name", "x", 13.0),
            ("photo-1", "x", 2.0),
            ("photo-2", "x", 51.5),
            ("weight-1", "x", 2.0),
            ("signature", "x", 74.75),
            ("footer-note", "x", 2.0),
            ("footer-thanks", "x", 61.5),
        ),
        missing_ids=(
            "header-logo-block",
            "header-company-block",
            "header-right-block",
            "footer-note-block",
            "footer-thanks-block",
        ),
        tolerance=0.75,
    ):
        return True

    if layout_matches_signature(
        layout,
        expected_version=4,
        field_rows_signature={"x": 2.0, "w": 96.0},
        element_signature=(
            ("header-logo-block", "x", 2.0),
            ("header-company-block", "x", 13.5),
            ("photo-1", "x", 2.0),
            ("photo-2", "x", 51.5),
            ("weight-1", "y", 80.5),
            ("signature", "y", 80.5),
            ("footer-note-block", "y", 94.0),
            ("footer-thanks-block", "y", 94.0),
            ("footer-note", "y", 95.0),
            ("footer-thanks", "y", 95.0),
        ),
        tolerance=0.75,
    ):
        return True

    if layout_matches_signature(
        layout,
        expected_version=5,
        field_rows_signature={"x": 2.0, "w": 96.0},
        element_signature=(
            ("header-logo-block", "x", 2.0),
            ("header-company-block", "x", 13.5),
            ("company-name", "y", 4.1),
            ("company-name", "fontSize", 23),
            ("address-line", "y", 10.2),
            ("capacity-badge", "y", 15.0),
            ("photo-1", "x", 2.0),
            ("photo-2", "x", 51.5),
            ("weight-1", "y", 80.5),
            ("signature", "y", 80.5),
            ("footer-note", "y", 95.0),
            ("footer-thanks", "y", 95.0),
        ),
        tolerance=0.75,
    ):
        return True

    if layout_matches_signature(
        layout,
        expected_version=6,
        field_rows_signature={"x": 2.0, "w": 96.0},
        element_signature=(
            ("header-logo-block", "x", 2.0),
            ("header-company-block", "x", 13.5),
            ("company-name", "x", 15.0),
            ("company-name", "y", 5.0),
            ("company-name", "fontSize", 25),
            ("address-line", "y", 11.5),
            ("capacity-badge", "y", 15.2),
            ("photo-1", "x", 2.0),
            ("photo-2", "x", 51.5),
            ("weight-1", "y", 79.6),
            ("signature", "y", 79.6),
            ("footer-note", "y", 93.2),
            ("footer-thanks", "y", 93.2),
        ),
        tolerance=0.75,
    ):
        return True

    if layout_matches_signature(
        layout,
        expected_version=7,
        field_rows_signature={"x": 2.0, "w": 96.0},
        element_signature=(
            ("header-logo-block", "x", 2.0),
            ("header-company-block", "x", 13.5),
            ("company-name", "x", 14.5),
            ("company-name", "y", 4.4),
            ("company-name", "fontSize", 29),
            ("company-name", "fontWeight", 900),
            ("address-line", "y", 12.2),
            ("capacity-badge", "y", 16.1),
            ("photo-1", "x", 2.0),
            ("photo-2", "x", 51.5),
            ("weight-1", "y", 79.6),
            ("signature", "y", 79.6),
            ("footer-note", "y", 93.2),
            ("footer-thanks", "y", 93.2),
        ),
        tolerance=0.75,
    ):
        return True

    if layout_matches_signature(
        layout,
        expected_version=8,
        field_rows_signature={"x": 2.0, "w": 96.0},
        element_signature=(
            ("header-logo-block", "x", 2.0),
            ("header-company-block", "x", 13.5),
            ("company-name", "x", 14.5),
            ("company-name", "y", 4.4),
            ("company-name", "fontSize", 31),
            ("company-name", "fontWeight", 1000),
            ("address-line", "x", 15.0),
            ("address-line", "y", 12.2),
            ("address-line", "fontSize", 13),
            ("address-line", "fontWeight", 800),
            ("capacity-badge", "x", 28.75),
            ("capacity-badge", "y", 16.1),
            ("capacity-badge", "h", 3.8),
            ("capacity-badge", "fontSize", 14),
            ("gov-title", "x", 74.3),
            ("gov-title", "y", 4.1),
            ("gov-title", "fontSize", 13),
            ("gov-line-1", "y", 9.6),
            ("gov-line-1", "fontSize", 11),
            ("gov-line-2", "y", 12.8),
            ("gov-line-2", "fontSize", 11),
            ("gov-line-3", "y", 16.0),
            ("gov-line-3", "fontSize", 11),
            ("footer-note", "fontSize", 10),
            ("footer-thanks", "fontSize", 11),
            ("footer-thanks", "h", 3.8),
        ),
        tolerance=0.75,
    ):
        return True

    return layout_matches_signature(
        layout,
        expected_version=8,
        field_rows_signature={"x": 2.0, "w": 96.0},
        element_signature=(
            ("header-logo-block", "x", 2.0),
            ("header-company-block", "x", 13.5),
            ("company-name", "x", 14.5),
            ("company-name", "y", 1.97),
            ("company-name", "fontSize", 29),
            ("company-name", "fontWeight", 900),
            ("address-line", "x", 14.89),
            ("address-line", "y", 8.16),
            ("address-line", "fontSize", 16),
            ("address-line", "fontWeight", 600),
            ("capacity-badge", "x", 28.52),
            ("capacity-badge", "y", 12.7),
            ("capacity-badge", "h", 6.4),
            ("capacity-badge", "fontSize", 20),
            ("gov-title", "x", 73.95),
            ("gov-title", "y", 3.46),
            ("gov-title", "fontSize", 17),
            ("gov-line-1", "y", 9.11),
            ("gov-line-1", "fontSize", 16),
            ("gov-line-2", "y", 12.31),
            ("gov-line-2", "fontSize", 16),
            ("gov-line-3", "y", 15.68),
            ("gov-line-3", "fontSize", 16),
            ("footer-note", "fontSize", 16),
            ("footer-thanks", "fontSize", 16),
            ("footer-thanks", "h", 4.2),
        ),
        tolerance=0.75,
    )




def layout_has_element(layout, element_id):
    if not isinstance(layout, dict) or not element_id:
        return False

    return any(
        isinstance(element, dict) and element.get("id") == element_id
        for element in layout.get("elements", [])
    )


def layout_element_has_meta_sources(layout, element_id, expected_sources):
    if not isinstance(layout, dict) or not element_id:
        return False

    expected = [str(source) for source in (expected_sources or []) if source]
    for element in layout.get("elements", []):
        if not isinstance(element, dict) or element.get("id") != element_id:
            continue
        meta_sources = element.get("metaSources")
        if not isinstance(meta_sources, list):
            return False
        return [str(source) for source in meta_sources if source] == expected

    return False


def layout_weight_element_matches(layout, element_id, *, expected_unit="", expected_meta_font_size=None):
    if not isinstance(layout, dict) or not element_id:
        return False

    for element in layout.get("elements", []):
        if not isinstance(element, dict) or element.get("id") != element_id:
            continue

        if expected_unit and str(element.get("unit") or "") != expected_unit:
            return False

        if expected_meta_font_size is not None:
            try:
                meta_font_size = int(element.get("metaFontSize"))
            except (TypeError, ValueError):
                return False
            if meta_font_size != int(expected_meta_font_size):
                return False

        return True

    return False


def layout_page_matches(layout, *, expected_width, expected_height, tolerance=0.25):
    if not isinstance(layout, dict):
        return False

    page = layout.get("page") if isinstance(layout.get("page"), dict) else {}
    try:
        width = float(page.get("widthMm"))
        height = float(page.get("heightMm"))
    except (TypeError, ValueError):
        return False

    return (
        abs(width - float(expected_width)) <= tolerance
        and abs(height - float(expected_height)) <= tolerance
    )


def layout_version_is_outdated(layout):
    if not isinstance(layout, dict):
        return True
    try:
        version = int(layout.get("version") or 0)
    except (TypeError, ValueError):
        return True
    return version < PRINTER_LAYOUT_VERSION


def is_outdated_default_layout_for_printer_type(layout, printer_type):
    resolved_type = normalize_printer_type(printer_type)

    if resolved_type == "thermal":
        return (
            not layout_has_element(layout, "thermal-company-name")
            or not layout_has_element(layout, "thermal-address-line-1")
            or not layout_has_element(layout, "thermal-operator-sign")
            or not layout_has_element(layout, "thermal-thanks")
            or len((layout.get("managedSections") or [])) != 1
            or not layout_page_matches(layout, expected_width=80.0, expected_height=80.0)
        )

    if resolved_type == "dot_matrix":
        return (
            layout.get("templateKind") != "blank_canvas"
            or layout_has_element(layout, "dot-company-name")
            or layout_has_element(layout, "dot-company-subtitle")
            or layout_has_element(layout, "dot-divider-top")
            or layout_has_element(layout, "dot-operator-sign")
            or layout_has_element(layout, "dot-footer-note")
        )

    if resolved_type == "a5":
        return (
            not layout_has_element(layout, "a5-company-name")
            or not layout_has_element(layout, "a5-weight-heading")
            or not layout_has_element(layout, "a5-footer-note")
            or not (
                layout_page_matches(layout, expected_width=210.0, expected_height=148.0)
                or layout_page_matches(layout, expected_width=148.0, expected_height=210.0)
            )
        )

    return False


def default_layout_requires_content_refresh(layout, printer_type):
    return layout_version_is_outdated(layout) or is_outdated_default_layout_for_printer_type(layout, printer_type)


def find_logo_image_url_in_layout(layout):
    if not isinstance(layout, dict):
        return ""

    for element in layout.get("elements", []):
        if not isinstance(element, dict):
            continue
        image_url = normalize_text(element.get("imageUrl"), "", max_length=255)
        if element.get("kind") == "image" and image_url:
            return image_url

    return ""


def resolve_preferred_a4_logo_image_url(rows):
    for row in rows or []:
        if normalize_layout_name(row.layout_name) == "A4 Default 2":
            continue
        if printer_template_row_printer_type(row) != "a4":
            continue

        image_url = find_logo_image_url_in_layout(load_printer_layout_json(row))
        if image_url:
            return image_url

    return ""


def build_editable_printer_template_layout(template_definition, rows, custom_columns, existing_layout=None):
    builder = template_definition["builder"]
    if normalize_layout_name(template_definition["layoutName"]).casefold() == "a4 default 2".casefold():
        logo_image_url = find_logo_image_url_in_layout(existing_layout)
        layout = builder(logo_image_url)
    else:
        layout = builder()

    return normalize_printer_layout(
        layout,
        custom_columns,
        template_definition["printerType"],
    )




    return False


def list_printer_template_rows():
    rows = Printer_layout.query.filter(
        Printer_layout.layout_name != PRINTER_LAYOUT_SETTINGS_NAME
    ).all()
    return sorted(
        rows,
        key=lambda row: (
            row.layout_name.casefold() != PRINTER_LAYOUT_NAME.casefold(),
            row.layout_name.casefold(),
        ),
    )


def unique_printer_layout_name(preferred_name, rows):
    normalized_name = normalize_layout_name(preferred_name, PRINTER_LAYOUT_NAME)
    existing_names = {
        row.layout_name.casefold()
        for row in rows or []
    }
    if normalized_name.casefold() not in existing_names:
        return normalized_name

    counter = 2
    while True:
        candidate = normalize_layout_name(f"{normalized_name} {counter}", normalized_name)
        if candidate.casefold() not in existing_names:
            return candidate
        counter += 1


def find_printer_template_row(layout_name, rows=None):
    normalized_name = normalize_layout_name(layout_name)
    if not normalized_name or normalized_name == PRINTER_LAYOUT_SETTINGS_NAME:
        return None

    rows = rows or list_printer_template_rows()
    target_name = normalized_name.casefold()
    return next(
        (row for row in rows if row.layout_name.casefold() == target_name),
        None,
    )


def printer_template_row_printer_type(row):
    if row is None:
        return DEFAULT_PRINTER_TYPE
    return infer_printer_type(load_printer_layout_json(row), row.layout_name)


def is_base_printer_template_name(layout_name, rows=None, printer_type=None):
    normalized_name = normalize_layout_name(layout_name)
    if not normalized_name:
        return False

    if normalized_name.casefold() == "a4 default 2".casefold():
        return True

    rows = rows or []
    row = find_printer_template_row(normalized_name, rows)
    if row is not None:
        resolved_printer_type = printer_template_row_printer_type(row)
        return (
            row.layout_name.casefold()
            == default_template_name_for_printer_type(resolved_printer_type).casefold()
        )

    if printer_type:
        return (
            normalized_name.casefold()
            == default_template_name_for_printer_type(printer_type).casefold()
        )

    return any(
        normalized_name.casefold()
        == default_template_name_for_printer_type(option["key"]).casefold()
        for option in PRINTER_TYPE_OPTIONS
    )


def is_protected_printer_template_name(layout_name, rows=None, printer_type=None):
    normalized_name = normalize_layout_name(layout_name)
    return (
        is_base_printer_template_name(normalized_name, rows, printer_type)
        or normalized_name.casefold() == A5_EMPTY_TEMPLATE_NAME.casefold()
        or normalized_name.casefold() == DOT_MATRIX_EMPTY_TEMPLATE_NAME.casefold()
    )


def ensure_printer_default_template(custom_columns):
    rows = list_printer_template_rows()
    created_rows = []
    renamed_rows = []

    legacy_a4_row = find_printer_template_row(LEGACY_A4_DEFAULT_TEMPLATE_NAME, rows)
    current_a4_row = find_printer_template_row(PRINTER_LAYOUT_NAME, rows)
    if legacy_a4_row is not None and current_a4_row is None:
        legacy_a4_row.layout_name = PRINTER_LAYOUT_NAME
        renamed_rows.append(legacy_a4_row)
        for row in rows:
            if row.id == legacy_a4_row.id:
                row.layout_name = PRINTER_LAYOUT_NAME
                break

        settings_row = get_printer_layout_settings_row()
        if settings_row is not None:
            settings = load_printer_layout_json(settings_row)
            active_name = normalize_layout_name(settings.get("activeLayoutName"))
            if active_name.casefold() == LEGACY_A4_DEFAULT_TEMPLATE_NAME.casefold():
                settings_row.layout_json = json.dumps({"activeLayoutName": PRINTER_LAYOUT_NAME})
                renamed_rows.append(settings_row)

    legacy_a5_row = find_printer_template_row(LEGACY_A5_DEFAULT_TEMPLATE_NAME, rows)
    current_a5_row = find_printer_template_row(default_template_name_for_printer_type("a5"), rows)
    if legacy_a5_row is not None and current_a5_row is None:
        next_a5_name = default_template_name_for_printer_type("a5")
        legacy_a5_row.layout_name = next_a5_name
        renamed_rows.append(legacy_a5_row)
        for row in rows:
            if row.id == legacy_a5_row.id:
                row.layout_name = next_a5_name
                break

        settings_row = get_printer_layout_settings_row()
        if settings_row is not None:
            settings = load_printer_layout_json(settings_row)
            active_name = normalize_layout_name(settings.get("activeLayoutName"))
            if active_name.casefold() == LEGACY_A5_DEFAULT_TEMPLATE_NAME.casefold():
                settings_row.layout_json = json.dumps({"activeLayoutName": next_a5_name})
                renamed_rows.append(settings_row)

    existing_types = {
        printer_template_row_printer_type(row)
        for row in rows
    }

    if not rows:
        row = Printer_layout(
            layout_name=PRINTER_LAYOUT_NAME,
            layout_json=json.dumps(
                normalize_printer_layout(
                    default_printer_layout(DEFAULT_PRINTER_TYPE),
                    custom_columns,
                    DEFAULT_PRINTER_TYPE,
                )
            ),
        )
        db.session.add(row)
        rows.append(row)
        created_rows.append(row)
        existing_types.add(DEFAULT_PRINTER_TYPE)

    for option in PRINTER_TYPE_OPTIONS:
        printer_type = option["key"]
        if printer_type in existing_types:
            continue
        layout_name = unique_printer_layout_name(
            default_template_name_for_printer_type(printer_type),
            rows,
        )
        row = Printer_layout(
            layout_name=layout_name,
            layout_json=json.dumps(
                normalize_printer_layout(
                    default_printer_layout(printer_type),
                    custom_columns,
                    printer_type,
                )
            ),
        )
        db.session.add(row)
        rows.append(row)
        created_rows.append(row)
        existing_types.add(printer_type)

    current_a4_row = find_printer_template_row(PRINTER_LAYOUT_NAME, rows)
    if current_a4_row is not None:
        current_a4_layout = load_printer_layout_json(current_a4_row)
        if (
            layout_version_is_outdated(current_a4_layout)
            and (
                not layout_element_has_meta_sources(current_a4_layout, "weight-1", ["grossDate", "grossTime"])
                or not layout_element_has_meta_sources(current_a4_layout, "weight-2", ["tareDate", "tareTime"])
                or not layout_weight_element_matches(current_a4_layout, "weight-1", expected_unit="kg", expected_meta_font_size=8)
                or not layout_weight_element_matches(current_a4_layout, "weight-2", expected_unit="kg", expected_meta_font_size=8)
            )
        ):
            current_a4_row.layout_json = json.dumps(
                normalize_printer_layout(
                    default_printer_layout(DEFAULT_PRINTER_TYPE),
                    custom_columns,
                    DEFAULT_PRINTER_TYPE,
                )
            )
            created_rows.append(current_a4_row)

    for printer_type in ("a5", "dot_matrix"):
        base_row = find_printer_template_row(
            default_template_name_for_printer_type(printer_type),
            rows,
        )
        if base_row is None:
            continue

        existing_layout = load_printer_layout_json(base_row)
        if default_layout_requires_content_refresh(existing_layout, printer_type):
            base_row.layout_json = json.dumps(
                normalize_printer_layout(
                    default_printer_layout(printer_type),
                    custom_columns,
                    printer_type,
                )
            )
            created_rows.append(base_row)

    for template_definition in EDITABLE_PRINTER_TEMPLATE_DEFINITIONS:
        layout_name = normalize_layout_name(template_definition["layoutName"])
        existing_row = find_printer_template_row(layout_name, rows)
        if existing_row is not None:
            existing_layout = load_printer_layout_json(existing_row)
            if (
                (
                    layout_name.casefold() == A5_EMPTY_TEMPLATE_NAME.casefold()
                    and is_outdated_empty_a5_template_layout(existing_layout)
                )
                or (
                    layout_name.casefold() == DOT_MATRIX_EMPTY_TEMPLATE_NAME.casefold()
                    and is_outdated_empty_dot_matrix_template_layout(existing_layout)
                )
            ):
                existing_row.layout_json = json.dumps(
                    build_editable_printer_template_layout(
                        template_definition,
                        rows,
                        custom_columns,
                        existing_layout,
                    )
                )
                created_rows.append(existing_row)
                continue

            if (
                layout_name == "A4 Default 2"
                and layout_version_is_outdated(existing_layout)
                and (
                    is_outdated_second_default_a4_layout(existing_layout)
                    or not layout_has_element(existing_layout, "logo-image-2")
                    or find_logo_image_url_in_layout(existing_layout)
                    or not layout_element_has_meta_sources(existing_layout, "weight-1", ["grossDate", "grossTime"])
                    or not layout_element_has_meta_sources(existing_layout, "weight-2", ["tareDate", "tareTime"])
                    or not layout_weight_element_matches(existing_layout, "weight-1", expected_unit="kg", expected_meta_font_size=9)
                    or not layout_weight_element_matches(existing_layout, "weight-2", expected_unit="kg", expected_meta_font_size=9)
                )
            ):
                existing_row.layout_json = json.dumps(
                    build_editable_printer_template_layout(
                        template_definition,
                        rows,
                        custom_columns,
                        existing_layout,
                    )
                )
                created_rows.append(existing_row)
            continue

        row = Printer_layout(
            layout_name=layout_name,
            layout_json=json.dumps(
                build_editable_printer_template_layout(
                    template_definition,
                    rows,
                    custom_columns,
                )
            ),
        )
        db.session.add(row)
        rows.append(row)
        created_rows.append(row)

    if created_rows or renamed_rows:
        db.session.commit()

    return list_printer_template_rows()


def get_printer_layout_settings_row():
    return Printer_layout.query.filter_by(layout_name=PRINTER_LAYOUT_SETTINGS_NAME).first()


def load_printer_layout_json(row):
    try:
        return json.loads(row.layout_json)
    except (TypeError, json.JSONDecodeError):
        return {}


def normalize_saved_printer_layout(
    layout,
    custom_columns,
    layout_name="",
    fallback_printer_type=DEFAULT_PRINTER_TYPE,
):
    printer_type = infer_printer_type(layout, layout_name)
    if not printer_type:
        printer_type = normalize_printer_type(fallback_printer_type)
    normalized_layout_name = normalize_layout_name(layout_name).casefold()
    if (
        printer_type == "dot_matrix"
        and normalized_layout_name == default_template_name_for_printer_type("dot_matrix").casefold()
        and is_outdated_default_layout_for_printer_type(layout, "dot_matrix")
    ):
        return normalize_printer_layout(
            default_dot_matrix_printer_layout(),
            custom_columns,
            "dot_matrix",
        )
    if is_legacy_default_layout(layout):
        return normalize_printer_layout(
            default_printer_layout(printer_type),
            custom_columns,
            printer_type,
        )
    return normalize_printer_layout(
        layout,
        custom_columns,
        printer_type,
    )


def get_active_printer_layout_name(custom_columns):
    rows = ensure_printer_default_template(custom_columns)
    template_names = {row.layout_name for row in rows}
    settings_row = get_printer_layout_settings_row()

    if settings_row is not None:
        settings = load_printer_layout_json(settings_row)
        active_name = normalize_layout_name(settings.get("activeLayoutName"))
        if active_name in template_names:
            return active_name

    default_row = find_printer_template_row(PRINTER_LAYOUT_NAME, rows)
    if default_row is not None:
        return default_row.layout_name

    return rows[0].layout_name


def set_active_printer_layout_name(layout_name, custom_columns):
    rows = ensure_printer_default_template(custom_columns)
    target_row = find_printer_template_row(layout_name, rows)
    if target_row is None:
        raise ValueError("Template not found")

    settings_row = get_printer_layout_settings_row()
    payload = json.dumps({"activeLayoutName": target_row.layout_name})

    if settings_row is None:
        settings_row = Printer_layout(
            layout_name=PRINTER_LAYOUT_SETTINGS_NAME,
            layout_json=payload,
        )
        db.session.add(settings_row)
    else:
        settings_row.layout_json = payload

    db.session.commit()
    return target_row.layout_name


def resolve_printer_layout_name(custom_columns, layout_name=None):
    rows = ensure_printer_default_template(custom_columns)
    requested_row = find_printer_template_row(layout_name, rows)
    if requested_row is not None:
        return requested_row.layout_name

    active_name = get_active_printer_layout_name(custom_columns)
    active_row = find_printer_template_row(active_name, rows)
    if active_row is not None:
        return active_row.layout_name

    return rows[0].layout_name


def get_saved_printer_layout_bundle(custom_columns, layout_name=None):
    rows = ensure_printer_default_template(custom_columns)
    resolved_name = resolve_printer_layout_name(custom_columns, layout_name)
    row = find_printer_template_row(resolved_name, rows)

    if row is None:
        return (
            PRINTER_LAYOUT_NAME,
            normalize_printer_layout(
                default_printer_layout(DEFAULT_PRINTER_TYPE),
                custom_columns,
                DEFAULT_PRINTER_TYPE,
            ),
        )

    return row.layout_name, normalize_saved_printer_layout(
        load_printer_layout_json(row),
        custom_columns,
        row.layout_name,
    )


def get_saved_printer_layout(custom_columns, layout_name=None):
    _, layout = get_saved_printer_layout_bundle(custom_columns, layout_name)
    return layout


def get_active_printer_type(custom_columns=None):
    try:
        cols = custom_columns if custom_columns is not None else get_custom_field_column_names()
        _, layout = get_saved_printer_layout_bundle(cols)
        return normalize_printer_type(layout.get("printerType"), DEFAULT_PRINTER_TYPE)
    except Exception:
        return ""




def number_to_words_inr(number):
    try:
        n = int(float(str(number).replace(",", "").replace("kg", "").strip()))
    except (ValueError, TypeError):
        return ""
    if n <= 0:
        return "ZERO KILOGRAMS ONLY" if n == 0 else ""

    ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
            "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
            "SEVENTEEN", "EIGHTEEN", "NINETEEN"]
    tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"]

    def num999(v):
        res = []
        if v >= 100:
            res.append(ones[v // 100] + " HUNDRED")
            v %= 100
        if v >= 20:
            res.append(tens[v // 10])
            v %= 10
        if v > 0:
            res.append(ones[v])
        return " ".join(res)

    crore = n // 10000000
    n %= 10000000
    lakh = n // 100000
    n %= 100000
    thousand = n // 1000
    n %= 1000
    hundred = n

    parts = []
    if crore:
        parts.append(num999(crore) + " CRORE")
    if lakh:
        parts.append(num999(lakh) + " LAKH")
    if thousand:
        parts.append(num999(thousand) + " THOUSAND")
    if hundred:
        parts.append(num999(hundred))

    words = " ".join(parts).strip()
    return f"{words} KILOGRAMS ONLY" if words else ""




def fallback_printer_template_name(rows, printer_type):
    resolved_printer_type = normalize_printer_type(printer_type)
    if resolved_printer_type == "dot_matrix":
        empty_row = find_printer_template_row(DOT_MATRIX_EMPTY_TEMPLATE_NAME, rows)
        if empty_row is not None:
            return empty_row.layout_name

    base_name = default_template_name_for_printer_type(resolved_printer_type)
    base_row = find_printer_template_row(base_name, rows)
    if base_row is not None:
        return base_row.layout_name

    matching_row = next(
        (row for row in rows if printer_template_row_printer_type(row) == resolved_printer_type),
        None,
    )
    if matching_row is not None:
        return matching_row.layout_name

    return rows[0].layout_name if rows else PRINTER_LAYOUT_NAME


def serialize_printer_templates(custom_columns, active_layout_name=None):
    rows = ensure_printer_default_template(custom_columns)
    active_name = active_layout_name or get_active_printer_layout_name(custom_columns)
    templates = []
    for row in rows:
        printer_type = printer_template_row_printer_type(row)
        row_layout = load_printer_layout_json(row)
        templates.append({
            "name": row.layout_name,
            "printerType": printer_type,
            "printerTypeLabel": printer_type_label(printer_type),
            "isActive": row.layout_name == active_name,
            "isBaseTemplate": is_base_printer_template_name(row.layout_name, rows, printer_type),
            "isProtectedTemplate": is_protected_printer_template_name(row.layout_name, rows, printer_type),
            "isBlankTemplate": (
                row.layout_name.casefold() == A5_EMPTY_TEMPLATE_NAME.casefold()
                or row.layout_name.casefold() == DOT_MATRIX_EMPTY_TEMPLATE_NAME.casefold()
                or row_layout.get("templateKind") == "blank_canvas"
            ),
        })

    return sorted(
        templates,
        key=lambda template: (
            PRINTER_TYPE_ORDER.get(template["printerType"], 999),
            not (template["printerType"] == "dot_matrix" and template["isBlankTemplate"]),
            not template["isBaseTemplate"],
            template["name"].casefold(),
        ),
    )


def build_printer_layout_response(custom_columns, layout_name=None, message=None):
    current_layout_name, layout = get_saved_printer_layout_bundle(custom_columns, layout_name)
    active_layout_name = get_active_printer_layout_name(custom_columns)
    payload = {
        "layout": layout,
        "defaultLayout": clone_layout(layout),
        "currentLayoutName": current_layout_name,
        "activeLayoutName": active_layout_name,
        "currentPrinterType": layout.get("printerType", DEFAULT_PRINTER_TYPE),
        "printerTypes": serialize_printer_types(),
        "templates": serialize_printer_templates(custom_columns, active_layout_name),
        "fieldOptions": printer_field_options(custom_columns),
        "photoOptions": PHOTO_SOURCE_OPTIONS,
        "sampleEntry": build_sample_printer_entry(custom_columns),
    }
    if message:
        payload["message"] = message
    return payload


def save_printer_layout(layout, custom_columns, layout_name=None, printer_type=None):
    rows = ensure_printer_default_template(custom_columns)
    resolved_name = normalize_layout_name(
        layout_name,
        resolve_printer_layout_name(custom_columns),
    )
    if resolved_name == PRINTER_LAYOUT_SETTINGS_NAME:
        raise ValueError("This template name is reserved")

    row = find_printer_template_row(resolved_name, rows)
    fallback_printer_type = printer_template_row_printer_type(row) if row is not None else normalize_printer_type(printer_type)
    normalized = normalize_printer_layout(layout, custom_columns, fallback_printer_type)

    if is_base_printer_template_name(resolved_name, rows, printer_type) and base_template_requires_restricted_editing(resolved_name, fallback_printer_type):
        if row is None:
            raise ValueError("Default template not found")
        existing_layout = normalize_saved_printer_layout(
            load_printer_layout_json(row),
            custom_columns,
            row.layout_name,
            fallback_printer_type,
        )
        validation_error = validate_base_template_update(existing_layout, normalized)
        if validation_error:
            raise ValueError(validation_error)

    if row is None:
        row = Printer_layout(
            layout_name=resolved_name,
            layout_json=json.dumps(normalized),
        )
        db.session.add(row)
    else:
        row.layout_json = json.dumps(normalized)

    db.session.commit()
    return row.layout_name, normalized


def create_printer_layout_template(
    layout_name,
    layout,
    custom_columns,
    printer_type=None,
    source_layout_name=None,
):
    rows = ensure_printer_default_template(custom_columns)
    normalized_name = normalize_layout_name(layout_name)
    if not normalized_name:
        raise ValueError("Template name is required")
    if normalized_name == PRINTER_LAYOUT_SETTINGS_NAME:
        raise ValueError("This template name is reserved")
    if is_base_printer_template_name(normalized_name, rows, printer_type):
        raise ValueError("This template name is reserved")
    if find_printer_template_row(normalized_name, rows) is not None:
        raise ValueError("Template name already exists")

    source_row = find_printer_template_row(source_layout_name, rows)
    if normalize_layout_name(source_layout_name) and source_row is None:
        raise ValueError("Template to copy from was not found")
    if source_row is not None:
        source_printer_type = printer_template_row_printer_type(source_row)
        requested_printer_type = normalize_printer_type(printer_type, source_printer_type)
        if requested_printer_type != source_printer_type:
            raise ValueError("Choose a source template from the selected printer type")

        normalized_layout = clone_layout(
            normalize_saved_printer_layout(
                load_printer_layout_json(source_row),
                custom_columns,
                source_row.layout_name,
                source_printer_type,
            )
        )
    else:
        if not isinstance(layout, dict):
            raise ValueError("Choose a template to copy from")

        normalized_layout = normalize_printer_layout(
            layout,
            custom_columns,
            normalize_printer_type(printer_type),
        )

    row = Printer_layout(
        layout_name=normalized_name,
        layout_json=json.dumps(normalized_layout),
    )
    db.session.add(row)
    db.session.commit()
    return row.layout_name, normalized_layout


def delete_printer_layout_template(layout_name, custom_columns):
    rows = ensure_printer_default_template(custom_columns)
    row = find_printer_template_row(layout_name, rows)
    if row is None:
        raise ValueError("Template not found")

    row_printer_type = printer_template_row_printer_type(row)
    if is_protected_printer_template_name(row.layout_name, rows, row_printer_type):
        raise ValueError("Built-in templates cannot be deleted")

    active_layout_name = get_active_printer_layout_name(custom_columns)
    db.session.delete(row)
    db.session.commit()

    remaining_rows = ensure_printer_default_template(custom_columns)
    next_layout_name = active_layout_name
    if row.layout_name == active_layout_name:
        next_layout_name = fallback_printer_template_name(remaining_rows, row_printer_type)
        set_active_printer_layout_name(next_layout_name, custom_columns)

    return row.layout_name, next_layout_name


def build_sample_printer_entry(custom_columns):
    return {
        "id": 0,
        "serialNo": "0012",
        "refNo": "REF-0012",
        "entryDate": "2026-06-08",
        "entryTime": "12:37 PM",
        "vehicleNo": "TN39CW3117",
        "weighingType": "Load",
        "material": "M-Sand",
        "customer": "Sample Customer",
        "mobileNo": "9876543210",
        "paymentMode": "Cash",
        "charges": 100,
        "grossWeight": 25000,
        "grossDate": "08-06-2026",
        "grossTime": "12:35 PM",
        "tareWeight": 15460,
        "tareDate": "08-06-2026",
        "tareTime": "12:52 PM",
        "netWeight": 9540,
        "cameraImages": [],
        "customFields": {
            column: f"Sample {index}"
            for index, column in enumerate(custom_columns, start=1)
        },
    }


def allowed_image_file(file_name):
    return Path(file_name or "").suffix.lower() in ALLOWED_IMAGE_EXTENSIONS


def save_printer_asset(upload):
    if not upload or not upload.filename:
        raise ValueError("Choose an image file to upload")

    if not allowed_image_file(upload.filename):
        raise ValueError("Use PNG, JPG, JPEG, or WEBP image files")

    upload.stream.seek(0, 2)
    size = upload.stream.tell()
    upload.stream.seek(0)

    if size > MAX_IMAGE_UPLOAD_BYTES:
        raise ValueError("Image size must be 5 MB or below")

    safe_name = secure_filename(upload.filename)
    extension = Path(safe_name).suffix.lower()
    file_name = f"printer-{uuid4().hex}{extension}"
    static_root = Path(current_app.static_folder or (Path(current_app.root_path) / "static"))
    asset_dir = static_root / "printer_assets"
    asset_dir.mkdir(parents=True, exist_ok=True)
    upload.save(asset_dir / file_name)
    return f"/static/printer_assets/{file_name}"





def get_active_printer_type(custom_columns=None):
    try:
        cols = custom_columns if custom_columns is not None else get_custom_field_column_names()
        _, layout = get_saved_printer_layout_bundle(cols)
        return normalize_printer_type(layout.get("printerType"), DEFAULT_PRINTER_TYPE)
    except Exception:
        return ""



from .a4 import (
    default_field_rows,
    default_printer_elements,
    default_a4_printer_layout,
    second_default_a4_printer_layout,
    is_outdated_second_default_a4_layout,
)
from .a5 import (
    default_a5_field_rows,
    default_a5_printer_layout,
    empty_a5_printer_layout,
    is_outdated_empty_a5_template_layout,
)
from .dot_matrix import (
    default_dot_matrix_field_rows,
    default_dot_matrix_weight_rows,
    default_dot_matrix_printer_layout,
    empty_dot_matrix_printer_layout,
    expand_dot_matrix_full_width_elements,
    expand_dot_matrix_full_width_sections,
    is_outdated_empty_dot_matrix_template_layout,
    generate_dot_matrix_raw_lines,
    escp_font_select_command,
    spool_raw_data_to_printer,
    get_available_windows_printers,
)

def default_printer_layout(printer_type=DEFAULT_PRINTER_TYPE):
    normalized_type = normalize_printer_type(printer_type)
    if normalized_type == "a5":
        return default_a5_printer_layout()
    if normalized_type == "thermal":
        return default_thermal_printer_layout()
    if normalized_type == "dot_matrix":
        return default_dot_matrix_printer_layout()
    return default_a4_printer_layout()


def is_outdated_default_layout_for_printer_type(layout, printer_type):
    resolved_type = normalize_printer_type(printer_type)
    if not isinstance(layout, dict):
        return True

    if resolved_type == "thermal":
        return (
            not layout_has_element(layout, "thermal-company-name")
            or not layout_has_element(layout, "thermal-weight-heading")
            or not layout_has_element(layout, "thermal-thanks")
            or len((layout.get("managedSections") or [])) != 1
            or not layout_page_matches(layout, expected_width=80.0, expected_height=80.0)
        )

    if resolved_type == "dot_matrix":
        return (
            layout.get("templateKind") != "blank_canvas"
            or layout_has_element(layout, "dot-company-name")
            or layout_has_element(layout, "dot-company-subtitle")
            or layout_has_element(layout, "dot-divider-top")
            or layout_has_element(layout, "dot-operator-sign")
            or layout_has_element(layout, "dot-footer-note")
        )

    if resolved_type == "a5":
        return (
            not layout_has_element(layout, "a5-company-name")
            or not layout_has_element(layout, "a5-weight-heading")
            or not layout_has_element(layout, "a5-footer-note")
            or not (
                layout_page_matches(layout, expected_width=210.0, expected_height=148.0)
                or layout_page_matches(layout, expected_width=148.0, expected_height=210.0)
            )
        )

    return False


EDITABLE_PRINTER_TEMPLATE_DEFINITIONS = (
    {
        "layoutName": "A4 Default 2",
        "printerType": "a4",
        "builder": second_default_a4_printer_layout,
    },
    {
        "layoutName": A5_EMPTY_TEMPLATE_NAME,
        "printerType": "a5",
        "builder": empty_a5_printer_layout,
    },
    {
        "layoutName": DOT_MATRIX_EMPTY_TEMPLATE_NAME,
        "printerType": "dot_matrix",
        "builder": empty_dot_matrix_printer_layout,
    },
)
