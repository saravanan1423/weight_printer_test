import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from flask import Blueprint, current_app, jsonify, render_template, request
from sqlalchemy import func, text

from models.models import Camera_settings, Credit_management, Customer_details, Material_name, Vehicle_details, db
from whatsapp_service import queue_whatsapp_message
from admin_config import get_live_weight_enabled, get_resend_button_enabled, get_reset_serial_daily, get_tare_weight_enabled


weightment_bp = Blueprint("weightment", __name__)

BASE_CUSTOM_FIELD_COLUMNS = {"id", "created_at", "updated_at"}
WEIGHMENT_TABLE = "weighment_entries"
CUSTOM_FIELD_CONFIG_TABLE = "custom_field_config"
BUILTIN_FIELD_DEFAULTS = {
    "vehicleNo": {"label": "Vehicle No", "enabled": True, "required": True},
    "vehicleType": {"label": "Vehicle Type", "enabled": True, "required": False},
    "weighingType": {"label": "Weighing Type", "enabled": True, "required": True},
    "material": {"label": "Material", "enabled": True, "required": False},
    "customer": {"label": "Customer", "enabled": True, "required": False},
    "mobileNo": {"label": "Mobile No", "enabled": True, "required": False},
    "paymentMode": {"label": "Payment Mode", "enabled": True, "required": True},
    "charges": {"label": "Charges", "enabled": True, "required": False},
    "camera": {"label": "Camera", "enabled": True, "required": False},
}
WEIGHMENT_CAMERA_IMAGE_COLUMNS = {
    camera_no: f"camera_{camera_no}_image"
    for camera_no in range(1, 5)
}
BASE_WEIGHMENT_COLUMNS = {
    "id",
    "serial_no",
    "ref_no",
    "entry_date",
    "entry_time",
    "vehicle_number",
    "vehicle_type_name",
    "weighing_type",
    "material",
    "customer",
    "mobile_no",
    "mobile_no_2",
    "payment_mode",
    "charge_1",
    "charge_2",
    "charges",
    "gross_weight",
    "gross_date",
    "gross_time",
    "tare_weight",
    "tare_date",
    "tare_time",
    "net_weight",
    "previous_entry_id",
    *WEIGHMENT_CAMERA_IMAGE_COLUMNS.values(),
    "created_at",
    "updated_at",
}
WEIGHMENT_BASE_COLUMN_DEFINITIONS = [
    ("id", "INTEGER PRIMARY KEY"),
    ("serial_no", "VARCHAR(30) NOT NULL"),
    ("ref_no", "VARCHAR(30) NOT NULL"),
    ("entry_date", "VARCHAR(20) NOT NULL"),
    ("entry_time", "VARCHAR(20) NOT NULL"),
    ("vehicle_number", "VARCHAR(20) NOT NULL"),
    ("vehicle_type_name", "VARCHAR(50)"),
    ("weighing_type", "VARCHAR(30) NOT NULL"),
    ("material", "VARCHAR(50) NOT NULL"),
    ("customer", "VARCHAR(50) NOT NULL"),
    ("mobile_no", "VARCHAR(10) NOT NULL"),
    ("mobile_no_2", "VARCHAR(10)"),
    ("payment_mode", "VARCHAR(30) NOT NULL"),
    ("charge_1", "FLOAT"),
    ("charge_2", "FLOAT"),
    ("charges", "FLOAT"),
    ("gross_weight", "FLOAT"),
    ("gross_date", "VARCHAR(20)"),
    ("gross_time", "VARCHAR(20)"),
    ("tare_weight", "FLOAT"),
    ("tare_date", "VARCHAR(20)"),
    ("tare_time", "VARCHAR(20)"),
    ("net_weight", "FLOAT"),
    ("previous_entry_id", "INTEGER"),
    *[(column, "TEXT") for column in WEIGHMENT_CAMERA_IMAGE_COLUMNS.values()],
    ("created_at", "DATETIME"),
    ("updated_at", "DATETIME"),
]


def get_custom_field_columns():
    rows = db.session.execute(text("PRAGMA table_info(custom_fields)")).mappings().all()
    user_columns = [row["name"] for row in rows if row["name"] not in BASE_CUSTOM_FIELD_COLUMNS]
    config_exists = db.session.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='table' AND name=:table_name"),
        {"table_name": CUSTOM_FIELD_CONFIG_TABLE},
    ).first() is not None
    changed = False
    if not config_exists:
        db.session.execute(
            text(
                f"""
                CREATE TABLE {CUSTOM_FIELD_CONFIG_TABLE} (
                    column_name VARCHAR(40) PRIMARY KEY COLLATE NOCASE,
                    display_label VARCHAR(40) NOT NULL,
                    is_enabled INTEGER NOT NULL DEFAULT 1,
                    is_required INTEGER NOT NULL DEFAULT 0,
                    field_type VARCHAR(20) NOT NULL DEFAULT 'text',
                    calculation_left VARCHAR(40),
                    calculation_right VARCHAR(40),
                    calculation_operator VARCHAR(20) NOT NULL DEFAULT 'add'
                )
                """
            )
        )
        changed = True
    config_columns = get_table_columns(CUSTOM_FIELD_CONFIG_TABLE) if config_exists else [
        "column_name", "display_label", "is_enabled", "is_required",
        "field_type", "calculation_left", "calculation_right", "calculation_operator"
    ]
    for column_name, definition in [
        ("field_type", "VARCHAR(20) NOT NULL DEFAULT 'text'"),
        ("calculation_left", "VARCHAR(40)"),
        ("calculation_right", "VARCHAR(40)"),
        ("calculation_operator", "VARCHAR(20) NOT NULL DEFAULT 'add'"),
    ]:
        if column_name not in config_columns:
            db.session.execute(
                text(
                    f"ALTER TABLE {CUSTOM_FIELD_CONFIG_TABLE} "
                    f"ADD COLUMN {column_name} {definition}"
                )
            )
            changed = True

    settings = {
        row["column_name"].lower(): row
        for row in db.session.execute(
            text(
                f"""
                SELECT column_name, display_label, is_enabled, is_required,
                       field_type, calculation_left, calculation_right, calculation_operator
                FROM {CUSTOM_FIELD_CONFIG_TABLE}
                """
            )
        ).mappings().all()
    }
    for field_name, defaults in BUILTIN_FIELD_DEFAULTS.items():
        config_name = f"builtin:{field_name}"
        if config_name.lower() in settings:
            continue
        db.session.execute(
            text(
                f"""
                INSERT INTO {CUSTOM_FIELD_CONFIG_TABLE}
                    (column_name, display_label, is_enabled, is_required)
                VALUES (:column_name, :display_label, :is_enabled, :is_required)
                """
            ),
            {
                "column_name": config_name,
                "display_label": defaults["label"],
                "is_enabled": int(defaults["enabled"]),
                "is_required": int(defaults["required"]),
            },
        )
        settings[config_name.lower()] = {
            "column_name": config_name,
            "display_label": defaults["label"],
            "is_enabled": int(defaults["enabled"]),
            "is_required": int(defaults["required"]),
            "field_type": "text",
            "calculation_left": "",
            "calculation_right": "",
            "calculation_operator": "add",
        }
        changed = True
    for column in user_columns:
        if column.lower() in settings:
            continue
        label = column.replace("_", " ")
        db.session.execute(
            text(
                f"""
                INSERT INTO {CUSTOM_FIELD_CONFIG_TABLE}
                    (column_name, display_label, is_enabled, is_required)
                VALUES (:column_name, :display_label, 1, 0)
                """
            ),
            {"column_name": column, "display_label": label},
        )
        settings[column.lower()] = {
            "column_name": column,
            "display_label": label,
            "is_enabled": 1,
            "is_required": 0,
            "field_type": "text",
            "calculation_left": "",
            "calculation_right": "",
            "calculation_operator": "add",
        }
        changed = True
    if changed:
        db.session.commit()

    return [
        {
            "name": column,
            "label": settings[column.lower()]["display_label"],
            "input_id": f"customField{index}",
            "enabled": bool(settings[column.lower()]["is_enabled"]),
            "required": bool(settings[column.lower()]["is_required"]),
            "field_type": settings[column.lower()]["field_type"] or "text",
            "calculation_left": settings[column.lower()]["calculation_left"] or "",
            "calculation_right": settings[column.lower()]["calculation_right"] or "",
            "calculation_operator": settings[column.lower()]["calculation_operator"] or "add",
        }
        for index, column in enumerate(user_columns, start=1)
    ]


def get_builtin_field_settings():
    # This also creates/backfills the shared configuration table.
    get_custom_field_columns()
    rows = {
        row["column_name"].lower(): row
        for row in db.session.execute(
            text(
                f"""
                SELECT column_name, display_label, is_enabled, is_required
                FROM {CUSTOM_FIELD_CONFIG_TABLE}
                WHERE column_name LIKE 'builtin:%'
                """
            )
        ).mappings().all()
    }
    return {
        field_name: {
            "label": rows[f"builtin:{field_name}".lower()]["display_label"],
            "enabled": bool(rows[f"builtin:{field_name}".lower()]["is_enabled"]),
            "required": bool(rows[f"builtin:{field_name}".lower()]["is_required"]),
        }
        for field_name in BUILTIN_FIELD_DEFAULTS
    }


def quote_identifier(identifier):
    return '"' + identifier.replace('"', '""') + '"'


def get_table_columns(table_name):
    rows = db.session.execute(text(f"PRAGMA table_info({table_name})")).mappings().all()
    return [row["name"] for row in rows]


def get_custom_field_column_names():
    return [column["name"] for column in get_custom_field_columns()]


def weighment_table_exists():
    row = db.session.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:table_name"),
        {"table_name": WEIGHMENT_TABLE},
    ).first()
    return row is not None


def create_weighment_table():
    custom_definitions = [
        (column, "TEXT DEFAULT NULL")
        for column in get_custom_field_column_names()
    ]
    column_sql = ", ".join(
        f"{quote_identifier(column)} {definition}"
        for column, definition in [*WEIGHMENT_BASE_COLUMN_DEFINITIONS, *custom_definitions]
    )
    db.session.execute(text(f"CREATE TABLE IF NOT EXISTS {WEIGHMENT_TABLE} ({column_sql})"))
    db.session.commit()


def weighment_table_has_unique_ticket_constraints():
    create_sql = db.session.execute(
        text("SELECT sql FROM sqlite_master WHERE type='table' AND name=:table_name"),
        {"table_name": WEIGHMENT_TABLE},
    ).scalar() or ""
    return "UNIQUE" in create_sql.upper()


def rebuild_weighment_table_without_unique_constraints():
    current_columns = get_table_columns(WEIGHMENT_TABLE)
    custom_columns = [column for column in current_columns if column not in BASE_WEIGHMENT_COLUMNS]
    next_table = f"{WEIGHMENT_TABLE}_next"
    all_definitions = [
        *WEIGHMENT_BASE_COLUMN_DEFINITIONS,
        *[(column, "TEXT DEFAULT NULL") for column in custom_columns],
    ]
    column_sql = ", ".join(
        f"{quote_identifier(column)} {definition}"
        for column, definition in all_definitions
    )
    copy_columns = [column for column, _definition in all_definitions if column in current_columns]
    copy_sql = ", ".join(quote_identifier(column) for column in copy_columns)

    db.session.execute(text(f"CREATE TABLE {next_table} ({column_sql})"))
    if copy_columns:
        db.session.execute(
            text(
                f"INSERT INTO {next_table} ({copy_sql}) "
                f"SELECT {copy_sql} FROM {WEIGHMENT_TABLE}"
            )
        )
    db.session.execute(text(f"DROP TABLE {WEIGHMENT_TABLE}"))
    db.session.execute(text(f"ALTER TABLE {next_table} RENAME TO {WEIGHMENT_TABLE}"))
    db.session.commit()


def ensure_weighment_schema():
    if not weighment_table_exists():
        create_weighment_table()
    elif weighment_table_has_unique_ticket_constraints():
        rebuild_weighment_table_without_unique_constraints()

    custom_columns = get_custom_field_column_names()
    weighment_columns = set(get_table_columns(WEIGHMENT_TABLE))

    for column, definition in WEIGHMENT_BASE_COLUMN_DEFINITIONS:
        if column in weighment_columns:
            continue
        db.session.execute(
            text(
                f"ALTER TABLE {WEIGHMENT_TABLE} "
                f"ADD COLUMN {quote_identifier(column)} {definition}"
            )
        )

    for column in custom_columns:
        if column in weighment_columns:
            continue
        db.session.execute(
            text(
                f"ALTER TABLE {WEIGHMENT_TABLE} "
                f"ADD COLUMN {quote_identifier(column)} TEXT DEFAULT NULL"
            )
        )

    db.session.execute(
        text(
            f"""
            UPDATE {WEIGHMENT_TABLE}
            SET ref_no = CAST(CAST(ref_no AS INTEGER) AS TEXT)
            WHERE ref_no <> ''
              AND ref_no NOT GLOB '*[^0-9]*'
              AND ref_no <> CAST(CAST(ref_no AS INTEGER) AS TEXT)
            """
        )
    )
    stored_vehicle_numbers = db.session.execute(
        text(f"SELECT DISTINCT vehicle_number FROM {WEIGHMENT_TABLE}")
    ).scalars().all()
    for stored_vehicle_number in stored_vehicle_numbers:
        normalized_vehicle_number = normalize_vehicle_number(stored_vehicle_number)
        if normalized_vehicle_number == (stored_vehicle_number or ""):
            continue
        db.session.execute(
            text(
                f"""
                UPDATE {WEIGHMENT_TABLE}
                SET vehicle_number = :normalized_vehicle_number
                WHERE vehicle_number = :stored_vehicle_number
                """
            ),
            {
                "normalized_vehicle_number": normalized_vehicle_number,
                "stored_vehicle_number": stored_vehicle_number,
            },
        )
    db.session.commit()


def today_entry_date():
    return datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()


def normalize_entry_date(value):
    text_value = str(value or "").strip()
    if not text_value:
        return today_entry_date()

    for date_format in ("%Y-%m-%d", "%d/%m/%y", "%d/%m/%Y", "%d-%m-%Y", "%d-%m-%y"):
        try:
            return datetime.strptime(text_value, date_format).date().isoformat()
        except ValueError:
            continue

    return text_value


def entry_date_variants(value):
    normalized = normalize_entry_date(value)
    variants = [normalized]
    try:
        parsed = datetime.strptime(normalized, "%Y-%m-%d")
        variants.extend([
            parsed.strftime("%d/%m/%y"),
            parsed.strftime("%d/%m/%Y"),
            parsed.strftime("%d-%m-%Y"),
            parsed.strftime("%d-%m-%y"),
        ])
    except ValueError:
        pass

    original = str(value or "").strip()
    if original:
        variants.append(original)

    return list(dict.fromkeys(variants))


def format_ref_no(value):
    return str(int(value))


def next_daily_serial(entry_date):
    if not get_reset_serial_daily():
        max_serial = db.session.execute(
            text(f"SELECT MAX(CAST(serial_no AS INTEGER)) FROM {WEIGHMENT_TABLE}")
        ).scalar() or 0
        return str(int(max_serial) + 1)

    count = db.session.execute(
        text(f"SELECT COUNT(*) FROM {WEIGHMENT_TABLE} WHERE entry_date = :entry_date"),
        {"entry_date": entry_date},
    ).scalar() or 0
    return str(int(count) + 1)


def next_daily_ref(entry_date):
    rows = db.session.execute(
        text(f"SELECT DISTINCT ref_no FROM {WEIGHMENT_TABLE} WHERE entry_date = :entry_date"),
        {"entry_date": entry_date},
    ).scalars().all()
    max_ref = 0
    for ref_no in rows:
        match = re.search(r"(\d+)$", ref_no or "")
        if match:
            max_ref = max(max_ref, int(match.group(1)))
    return format_ref_no(max_ref + 1)


def serialize_weighment_row(row):
    if row is None:
        return None
    values = dict(row)
    return {
        "id": values.get("id"),
        "serialNo": values.get("serial_no") or "",
        "refNo": values.get("ref_no") or "",
        "entryDate": values.get("entry_date") or "",
        "entryTime": values.get("entry_time") or "",
        "vehicleNo": normalize_vehicle_number(values.get("vehicle_number")),
        "vehicleType": values.get("vehicle_type_name") or "",
        "weighingType": values.get("weighing_type") or "",
        "material": values.get("material") or "",
        "customer": values.get("customer") or "",
        "mobileNo1": values.get("mobile_no") or "",
        "mobileNo": values.get("mobile_no") or "",
        "mobileNo2": values.get("mobile_no_2") or "",
        "paymentMode": values.get("payment_mode") or "",
        "charge1": values.get("charge_1"),
        "charge2": values.get("charge_2"),
        "charges": values.get("charges"),
        "grossWeight": values.get("gross_weight"),
        "grossDate": values.get("gross_date") or "",
        "grossTime": values.get("gross_time") or "",
        "tareWeight": values.get("tare_weight"),
        "tareDate": values.get("tare_date") or "",
        "tareTime": values.get("tare_time") or "",
        "netWeight": values.get("net_weight"),
        "cameraImages": serialize_camera_images(values),
        "customFields": {
            column: values.get(column)
            for column in get_custom_field_column_names()
            if column in values
        },
    }


def normalize_vehicle_number(value):
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def normalize_weighing_type(value):
    return (value or "").strip().upper()


def normalize_payment_mode(value):
    return (value or "").strip().upper()


def parse_optional_float(value):
    if value in (None, ""):
        return None
    return float(value)


def resolve_customer_record(payload):
    customer_name = (payload.get("customer") or "").strip()
    mobile_no, _ = split_mobile_number_entry(
        payload.get("mobileNo1") or payload.get("mobileNo"),
        payload.get("mobileNo2"),
    )

    query = Customer_details.query
    if customer_name and mobile_no:
        row = query.filter(
            func.lower(Customer_details.customer_name) == customer_name.lower(),
            Customer_details.mobile_number == mobile_no,
        ).first()
        if row is not None:
            return row
    if customer_name:
        row = query.filter(
            func.lower(Customer_details.customer_name) == customer_name.lower(),
        ).first()
        if row is not None:
            return row
    if mobile_no:
        return query.filter(Customer_details.mobile_number == mobile_no).first()
    return None


def get_credit_available(row):
    return max(float(row.credit_amount or 0) - float(row.used_amount or 0), 0.0)


def split_mobile_number_entry(value, secondary_value=None):
    primary_part = str(value or "").split(",", 1)[0]
    primary = re.sub(r"\D", "", primary_part)
    if secondary_value not in (None, ""):
        secondary = re.sub(r"\D", "", secondary_value)
    else:
        parts = str(value or "").split(",", 1)
        secondary = re.sub(r"\D", "", parts[1]) if len(parts) > 1 else ""
    return primary, secondary


def normalize_weight_entry_value(value):
    if value in (None, ""):
        return None
    return float(value)


def paired_weight_values(previous_row, weighing_type, payload):
    current_type = normalize_weighing_type(weighing_type)
    apply_master_tare = bool(payload.get("applyMasterTare"))
    current_gross = normalize_weight_entry_value(payload.get("grossWeight"))
    current_tare = normalize_weight_entry_value(payload.get("tareWeight"))
    current_gross_date = ((payload.get("grossDate") or "").strip() or None)
    current_gross_time = ((payload.get("grossTime") or "").strip() or None)
    current_tare_date = ((payload.get("tareDate") or "").strip() or None)
    current_tare_time = ((payload.get("tareTime") or "").strip() or None)

    if previous_row is None:
        return {
            "gross_weight": current_gross if current_type == "FULL LOAD" else None,
            "gross_date": current_gross_date if current_type == "FULL LOAD" else None,
            "gross_time": current_gross_time if current_type == "FULL LOAD" else None,
            "tare_weight": current_tare if current_type in {"EMPTY", "FULL LOAD"} else None,
            "tare_date": current_tare_date if current_type in {"EMPTY", "FULL LOAD"} else None,
            "tare_time": current_tare_time if current_type in {"EMPTY", "FULL LOAD"} else None,
        }

    previous_type = normalize_weighing_type(previous_row.get("weighing_type"))
    previous_prefix = "gross" if previous_type == "FULL LOAD" else "tare"
    previous_weight = previous_row.get(f"{previous_prefix}_weight")
    previous_date = previous_row.get(f"{previous_prefix}_date") or previous_row.get("entry_date") or None
    previous_time = previous_row.get(f"{previous_prefix}_time") or previous_row.get("entry_time") or None

    if current_type == "FULL LOAD":
        return {
            "gross_weight": current_gross,
            "gross_date": current_gross_date,
            "gross_time": current_gross_time,
            "tare_weight": current_tare if current_tare is not None else previous_weight,
            "tare_date": current_tare_date if current_tare is not None else previous_date,
            "tare_time": current_tare_time if current_tare is not None else previous_time,
        }

    if current_type == "EMPTY":
        return {
            "gross_weight": previous_weight,
            "gross_date": previous_date,
            "gross_time": previous_time,
            "tare_weight": current_tare,
            "tare_date": current_tare_date,
            "tare_time": current_tare_time,
        }

    return {
        "gross_weight": current_gross if current_type == "FULL LOAD" else None,
        "gross_date": current_gross_date if current_type == "FULL LOAD" else None,
        "gross_time": current_gross_time if current_type == "FULL LOAD" else None,
        "tare_weight": current_tare if current_type == "EMPTY" or (current_type == "FULL LOAD" and apply_master_tare) else None,
        "tare_date": current_tare_date if current_type == "EMPTY" or (current_type == "FULL LOAD" and apply_master_tare) else None,
        "tare_time": current_tare_time if current_type == "EMPTY" or (current_type == "FULL LOAD" and apply_master_tare) else None,
    }


def parse_serial_number(value):
    match = re.search(r"\d+", str(value or ""))
    if not match:
        return None
    return int(match.group(0))


def serialize_camera_images(values):
    return [
        {
            "cameraNo": camera_no,
            "url": values.get(column),
        }
        for camera_no, column in WEIGHMENT_CAMERA_IMAGE_COLUMNS.items()
        if values.get(column)
    ]


def safe_path_component(value):
    sanitized = re.sub(r"[^A-Za-z0-9_-]+", "_", str(value or "").strip())
    return sanitized.strip("_") or "unknown"


def capture_weighment_camera_images(entry_id, entry_date):
    from routes.settings import camera as camera_module

    camera_module.ensure_camera_schema()
    camera_rows = Camera_settings.query.filter_by(is_connected=True).order_by(
        Camera_settings.camera_no.asc()
    ).all()
    camera_configs = [
        {
            "cameraNo": row.camera_no,
            "rtspUrl": camera_module.build_rtsp_url_from_parts(
                row.username,
                row.password,
                row.ip_address,
                row.port,
                row.stream_path,
            ),
        }
        for row in camera_rows
        if row.ip_address and row.camera_no in WEIGHMENT_CAMERA_IMAGE_COLUMNS
    ]
    if not camera_configs:
        return {}, [], 0

    capture_root = Path(
        current_app.config.get("WEIGHMAN_CAPTURE_ROOT")
        or (Path(current_app.static_folder or (Path(current_app.root_path) / "static")) / "weighment_captures")
    )
    relative_dir = Path(safe_path_component(entry_date)) / f"entry_{entry_id}"
    target_dir = capture_root / relative_dir
    target_dir.mkdir(parents=True, exist_ok=True)

    def capture_snapshot(camera_no, rtsp_url):
        camera_row = next((row for row in camera_rows if row.camera_no == camera_no), None)
        if camera_row and camera_row.ip_address and camera_row.port:
            network_error = camera_module.check_camera_network(
                camera_row.ip_address,
                camera_row.port,
                timeout_seconds=1,
            )
            if network_error:
                return camera_no, None, "Image not found"

        frame, error_message = camera_module.read_camera_frame(rtsp_url, timeout_seconds=4)
        if frame is None:
            normalized_error = (error_message or "").strip().lower()
            if any(term in normalized_error for term in ("network error", "timeout", "unreachable")):
                return camera_no, None, "Image not found"
            return camera_no, None, error_message or "Image not found"

        if camera_module.cv2 is None:
            return camera_no, None, "Image not found"

        ok, buffer = camera_module.cv2.imencode(".jpg", frame)
        if not ok:
            return camera_no, None, "Image not found"

        return camera_no, buffer.tobytes(), ""

    image_values = {}
    failed_cameras = []
    max_workers = min(len(camera_configs), len(WEIGHMENT_CAMERA_IMAGE_COLUMNS))

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(capture_snapshot, config["cameraNo"], config["rtspUrl"]): config["cameraNo"]
            for config in camera_configs
        }
        for future in as_completed(futures):
            camera_no = futures[future]
            try:
                camera_no, image_bytes, error_message = future.result()
            except Exception as error:
                failed_cameras.append({
                    "cameraNo": camera_no,
                    "error": "Image not found",
                })
                continue

            if image_bytes is None:
                failed_cameras.append({
                    "cameraNo": camera_no,
                    "error": error_message,
                })
                continue

            file_name = f"camera_{camera_no}.jpg"
            relative_path = relative_dir / file_name
            (target_dir / file_name).write_bytes(image_bytes)
            image_values[WEIGHMENT_CAMERA_IMAGE_COLUMNS[camera_no]] = f"/captures/{relative_path.as_posix()}"

    return image_values, failed_cameras, len(camera_configs)


def validate_master_values(payload):
    vehicle_number = normalize_vehicle_number(payload.get("vehicleNo"))
    material = (payload.get("material") or "").strip()
    customer = (payload.get("customer") or "").strip()
    mobile_no, _mobile_no_2 = split_mobile_number_entry(
        payload.get("mobileNo1") or payload.get("mobileNo"),
        payload.get("mobileNo2"),
    )
    weighing_type = normalize_weighing_type(payload.get("weighingType"))

    if not Vehicle_details.query.filter(func.upper(Vehicle_details.vehicle_number) == vehicle_number).first():
        return "Warning: Vehicle number is not registered in master"

    if material:
        if weighing_type == "EMPTY" and material.upper() == "EMPTY":
            material_ok = True
        else:
            material_ok = Material_name.query.filter(func.lower(Material_name.material_name) == material.lower()).first()

        if not material_ok:
            return "Warning: Material is not registered in master"

    if customer or mobile_no:
        if customer and mobile_no:
            customer_ok = Customer_details.query.filter(
                func.lower(Customer_details.customer_name) == customer.lower(),
                Customer_details.mobile_number == mobile_no,
            ).first()
        elif customer:
            customer_ok = Customer_details.query.filter(
                func.lower(Customer_details.customer_name) == customer.lower(),
            ).first()
        else:
            customer_ok = Customer_details.query.filter(
                Customer_details.mobile_number == mobile_no,
            ).first()

        if not customer_ok:
            return "Warning: Customer or mobile number is not registered in master"

    return None


def normalize_charge_value(value):
    if value in (None, ""):
        return 0.0
    return float(value)


def fetch_weighment_by_serial(entry_date, serial_no, direction="current"):
    serial_number = parse_serial_number(serial_no)
    if serial_number is None:
        return None

    date_variants = entry_date_variants(entry_date)
    date_params = {
        f"entry_date_{index}": value
        for index, value in enumerate(date_variants)
    }
    date_filter = ", ".join(f":{key}" for key in date_params)
    direction_sql = {
        "current": ("=", "ASC"),
        "prev": ("<", "DESC"),
        "next": (">", "ASC"),
    }
    operator, order = direction_sql.get(direction, direction_sql["current"])

    return db.session.execute(
        text(
            f"""
            SELECT *
            FROM {WEIGHMENT_TABLE}
            WHERE entry_date IN ({date_filter})
              AND CAST(serial_no AS INTEGER) {operator} :serial_no
            ORDER BY CAST(serial_no AS INTEGER) {order}
            LIMIT 1
            """
        ),
        {**date_params, "serial_no": serial_number},
    ).mappings().first()


def fetch_adjacent_weighment_any_date(entry_date, serial_no, direction="prev"):
    serial_number = parse_serial_number(serial_no)
    if serial_number is None or direction not in {"prev", "next"}:
        return None

    normalized_entry_date = normalize_entry_date(entry_date)
    operator = "<" if direction == "prev" else ">"
    order = "DESC" if direction == "prev" else "ASC"

    return db.session.execute(
        text(
            f"""
            SELECT *
            FROM {WEIGHMENT_TABLE}
            WHERE (entry_date || '-' || printf('%010d', CAST(serial_no AS INTEGER))) {operator}
                  (:entry_date || '-' || printf('%010d', :serial_no))
            ORDER BY entry_date {order}, CAST(serial_no AS INTEGER) {order}
            LIMIT 1
            """
        ),
        {"entry_date": normalized_entry_date, "serial_no": serial_number},
    ).mappings().first()


def weighment_navigation_state(row):
    if row is None:
        return {
            "hasPrevious": False,
            "hasNext": False,
        }
    entry_date = row.get("entry_date")
    serial_no = row.get("serial_no")
    return {
        "hasPrevious": fetch_adjacent_weighment_any_date(entry_date, serial_no, "prev") is not None,
        "hasNext": fetch_adjacent_weighment_any_date(entry_date, serial_no, "next") is not None,
    }


def fetch_weighment_by_id(entry_id):
    return db.session.execute(
        text(
            f"""
            SELECT *
            FROM {WEIGHMENT_TABLE}
            WHERE id = :entry_id
            LIMIT 1
            """
        ),
        {"entry_id": entry_id},
    ).mappings().first()


def calculate_net_weight(gross_weight, tare_weight):
    if gross_weight is None or tare_weight is None:
        return None
    return max(float(gross_weight) - float(tare_weight), 0.0)


def row_has_completed_weights(row):
    if row is None:
        return False
    return row.get("gross_weight") is not None and row.get("tare_weight") is not None


@weightment_bp.route("/weightment")
def weightment():
    ensure_weighment_schema()
    from admin_config import get_default_printer_name, get_direct_print_enabled
    from routes.settings.printer import get_active_printer_type
    return render_template(
        "weightment.html",
        custom_field_columns=get_custom_field_columns(),
        weightment_field_settings=get_builtin_field_settings(),
        resend_button_enabled=get_resend_button_enabled(),
        live_weight_enabled=get_live_weight_enabled(),
        active_printer_type=get_active_printer_type(),
        default_printer_name=get_default_printer_name(),
        direct_print_enabled=get_direct_print_enabled(),
    )


@weightment_bp.route("/api/weighments/next-ticket", methods=["GET"])
def weighment_next_ticket():
    ensure_weighment_schema()
    entry_date = normalize_entry_date(request.args.get("entryDate") or today_entry_date())
    serial_no = next_daily_serial(entry_date)
    ref_no = next_daily_ref(entry_date)
    return jsonify({
        "serialNo": serial_no,
        "refNo": ref_no,
        "entryDate": entry_date,
        "hasPrevious": fetch_adjacent_weighment_any_date(entry_date, serial_no, "prev") is not None,
        "hasNext": False,
    })


@weightment_bp.route("/api/weighments/vehicle-visit", methods=["GET"])
def weighment_vehicle_visit():
    ensure_weighment_schema()
    entry_date = normalize_entry_date(request.args.get("entryDate") or today_entry_date())
    vehicle_number = normalize_vehicle_number(request.args.get("vehicleNo"))
    include_history = str(request.args.get("includeHistory") or "").strip().lower() in {"1", "true", "yes"}

    if not vehicle_number:
        return jsonify({"message": "Vehicle number is required"}), 400

    rows = db.session.execute(
        text(
            f"""
            SELECT *
            FROM {WEIGHMENT_TABLE}
            WHERE vehicle_number = :vehicle_number
            ORDER BY id ASC
            """
        ),
        {"vehicle_number": vehicle_number},
    ).mappings().all()
    visit_count = sum(1 for row in rows if row["entry_date"] == entry_date)
    new_serial_no = next_daily_serial(entry_date)
    new_ref_no = next_daily_ref(entry_date)

    # Normal vehicle lookup offers unfinished first weighments. When the user
    # explicitly chooses Second Weighment, the latest ten records are offered
    # even if their earlier cycle is already complete.
    linked_entry_ids = {
        row["previous_entry_id"]
        for row in rows
        if row.get("previous_entry_id") is not None
    }

    def has_legacy_completed_return(first_row):
        weight_prefix = "gross" if normalize_weighing_type(first_row["weighing_type"]) == "FULL LOAD" else "tare"
        fields_to_match = (f"{weight_prefix}_weight", f"{weight_prefix}_date", f"{weight_prefix}_time")
        return any(
            completed["id"] > first_row["id"]
            and completed.get("previous_entry_id") is None
            and completed["ref_no"] == first_row["ref_no"]
            and row_has_completed_weights(completed)
            and all(completed[field] == first_row[field] for field in fields_to_match)
            for completed in rows
        )

    pending_rows = [
        row
        for row in rows
        if not row_has_completed_weights(row)
        and row["id"] not in linked_entry_ids
        and not has_legacy_completed_return(row)
    ][-10:]
    available_rows = rows[-10:] if include_history else pending_rows
    if available_rows:
        previous_row = available_rows[-1]
        return jsonify({
            "mode": "second",
            "visitCount": visit_count,
            "serialNo": new_serial_no,
            "refNo": previous_row["ref_no"],
            "newRefNo": new_ref_no,
            "entry": serialize_weighment_row(previous_row),
            "entries": [serialize_weighment_row(row) for row in available_rows],
        })

    return jsonify({
        "mode": "new",
        "visitCount": visit_count,
        "serialNo": new_serial_no,
        "refNo": new_ref_no,
        "newRefNo": new_ref_no,
        "entry": None,
    })


@weightment_bp.route("/api/weighments/lookup", methods=["GET"])
def weighment_lookup():
    ensure_weighment_schema()
    entry_date = normalize_entry_date(request.args.get("entryDate") or today_entry_date())
    serial_no = request.args.get("serialNo")
    direction = request.args.get("direction") or "current"

    if parse_serial_number(serial_no) is None:
        return jsonify({"message": "S.No is required"}), 400

    row = fetch_weighment_by_serial(entry_date, serial_no, direction)
    if row is None and direction in {"prev", "next"}:
        row = fetch_adjacent_weighment_any_date(entry_date, serial_no, direction)
    if row is None:
        return jsonify({"message": "No weighment found for this S.No"}), 404

    return jsonify({
        "entry": serialize_weighment_row(row),
        **weighment_navigation_state(row),
    })


@weightment_bp.route("/api/weighments", methods=["POST"])
def weighment_create():
    ensure_weighment_schema()
    payload = request.get_json(silent=True) or {}
    tare_weight_enabled = get_tare_weight_enabled()
    if not tare_weight_enabled:
        payload["applyMasterTare"] = False
        payload["tareOverride"] = False
    custom_values = payload.get("customFields") or {}
    custom_field_definitions = get_custom_field_columns()
    builtin_fields = get_builtin_field_settings()
    if not builtin_fields["material"]["enabled"]:
        payload["material"] = ""
    if not builtin_fields["customer"]["enabled"]:
        payload["customer"] = ""
    if not builtin_fields["mobileNo"]["enabled"]:
        payload["mobileNo"] = ""
        payload["mobileNo1"] = ""
        payload["mobileNo2"] = ""
    if not builtin_fields["vehicleType"]["enabled"]:
        payload["vehicleType"] = ""
        payload["vehicleTypeName"] = ""
    if not builtin_fields["paymentMode"]["enabled"]:
        payload["paymentMode"] = "Cash"
    if not builtin_fields["charges"]["enabled"]:
        payload["charge1"] = "0"
        payload["charge2"] = "0"
    now = datetime.now(ZoneInfo("Asia/Kolkata"))
    weighing_type = normalize_weighing_type(payload.get("weighingType"))
    is_full_load = weighing_type == "FULL LOAD"
    is_empty_load = weighing_type == "EMPTY"
    visit_stage = str(payload.get("visitStage") or "").strip().lower()

    required_fields = {
        "serialNo": "S.No is required",
        "refNo": "Ref No is required",
        "entryDate": "Date is required",
        "entryTime": "Time is required",
        "vehicleNo": f"{builtin_fields['vehicleNo']['label']} is required",
        "weighingType": f"{builtin_fields['weighingType']['label']} is required",
        "paymentMode": f"{builtin_fields['paymentMode']['label']} is required",
    }
    for field, message in required_fields.items():
        if not str(payload.get(field) or "").strip():
            return jsonify({"message": message}), 400

    configurable_required_values = {
        "material": payload.get("material"),
        "customer": payload.get("customer"),
        "mobileNo": payload.get("mobileNo1") or payload.get("mobileNo"),
        "charges": payload.get("charge1"),
    }
    for field_name, value in configurable_required_values.items():
        config = builtin_fields[field_name]
        if config["enabled"] and config["required"] and not str(value or "").strip():
            return jsonify({"message": f"{config['label']} is required"}), 400

    for custom_field in custom_field_definitions:
        if not custom_field["enabled"] or not custom_field["required"]:
            continue
        if not str(custom_values.get(custom_field["name"]) or "").strip():
            return jsonify({"message": f"{custom_field['label']} is required"}), 400

    if is_full_load:
        load_fields = {
            "grossWeight": "Gross weight is required",
            "grossDate": "Gross date is required",
            "grossTime": "Gross time is required",
        }
    elif is_empty_load:
        load_fields = {
            "tareWeight": "Tare weight is required",
            "tareDate": "Tare date is required",
            "tareTime": "Tare time is required",
        }
    else:
        load_fields = {}

    for field, message in load_fields.items():
        if not str(payload.get(field) or "").strip():
            return jsonify({"message": message}), 400

    master_error = validate_master_values(payload)
    if master_error:
        return jsonify({"message": master_error}), 400

    try:
        payment_mode = normalize_payment_mode(payload.get("paymentMode"))
        charge_1 = normalize_charge_value(payload.get("charge1"))
        charge_2 = normalize_charge_value(payload.get("charge2"))
        if charge_1 < 0 or charge_2 < 0:
            return jsonify({"message": "Charges cannot be negative"}), 400

        entry_date = normalize_entry_date(payload.get("entryDate"))
        vehicle_number = normalize_vehicle_number(payload.get("vehicleNo"))
        mobile_no, mobile_no_2 = split_mobile_number_entry(
            payload.get("mobileNo1") or payload.get("mobileNo"),
            payload.get("mobileNo2"),
        )
        vehicle_rows = db.session.execute(
            text(
                f"""
                SELECT
                    id,
                    ref_no,
                    weighing_type,
                    gross_weight,
                    gross_date,
                    gross_time,
                    tare_weight,
                    tare_date,
                    tare_time,
                    charge_1,
                    charge_2,
                    charges
                FROM {WEIGHMENT_TABLE}
                WHERE entry_date = :entry_date
                  AND vehicle_number = :vehicle_number
                ORDER BY id ASC
                """
            ),
            {"entry_date": entry_date, "vehicle_number": vehicle_number},
        ).mappings().all()
        serial_no = next_daily_serial(entry_date)
        previous_row = None
        if visit_stage == "second":
            try:
                previous_entry_id = int(payload.get("previousEntryId"))
            except (TypeError, ValueError):
                return jsonify({"message": "Select the previous weighment before saving the second weighment"}), 400

            previous_row = fetch_weighment_by_id(previous_entry_id)
            if (
                previous_row is None
                or normalize_vehicle_number(previous_row.get("vehicle_number")) != vehicle_number
            ):
                return jsonify({"message": "The selected previous weighment is no longer available"}), 409

        elif visit_stage != "first":
            previous_row = vehicle_rows[-1] if vehicle_rows and not row_has_completed_weights(vehicle_rows[-1]) else None

        if visit_stage != "second" and is_full_load and bool(payload.get("applyMasterTare")):
            previous_row = None
        is_second_cycle = previous_row is not None
        ref_no = previous_row["ref_no"] if is_second_cycle else next_daily_ref(entry_date)
        if is_second_cycle:
            # Only the current Charges field is persisted for this entry.
            charge_2 = 0.0

        total_charges = charge_1 + charge_2

        customer_record = resolve_customer_record(payload)
        credit_row = None
        credit_payment_amount = total_charges
        if payment_mode == "CREDIT" and credit_payment_amount > 0:
            if customer_record is None:
                return jsonify({"message": "Customer not found"}), 404
            credit_row = Credit_management.query.filter_by(customer_id=customer_record.id).first()
            if credit_row is None or get_credit_available(credit_row) < credit_payment_amount:
                return jsonify({"message": "No credits left recharge it"}), 400

        weight_values = paired_weight_values(previous_row, weighing_type, payload)
        net_weight = calculate_net_weight(weight_values["gross_weight"], weight_values["tare_weight"])
        vehicle_master = Vehicle_details.query.filter(
            func.upper(Vehicle_details.vehicle_number) == vehicle_number
        ).first()
        base_values = {
            "serial_no": serial_no,
            "ref_no": ref_no,
            "entry_date": entry_date,
            "entry_time": (payload.get("entryTime") or "").strip(),
            "vehicle_number": vehicle_number,
            "vehicle_type_name": (payload.get("vehicleType") or payload.get("vehicleTypeName") or "").strip(),
            "weighing_type": weighing_type,
            "material": (payload.get("material") or "").strip(),
            "customer": (payload.get("customer") or "").strip(),
            "mobile_no": mobile_no,
            "mobile_no_2": mobile_no_2 or None,
            "payment_mode": (payload.get("paymentMode") or "").strip(),
            "charge_1": charge_1,
            "charge_2": charge_2,
            "charges": total_charges,
            "gross_weight": weight_values["gross_weight"],
            "gross_date": weight_values["gross_date"],
            "gross_time": weight_values["gross_time"],
            "tare_weight": weight_values["tare_weight"],
            "tare_date": weight_values["tare_date"],
            "tare_time": weight_values["tare_time"],
            "net_weight": net_weight if net_weight is not None else parse_optional_float(payload.get("netWeight")),
            "previous_entry_id": previous_row["id"] if is_second_cycle else None,
            "created_at": now,
            "updated_at": now,
        }
    except (TypeError, ValueError):
        return jsonify({"message": "Weight and charges must be valid numbers"}), 400

    custom_columns = [column["name"] for column in custom_field_definitions]
    custom_insert_values = {
        column: str(custom_values.get(column)).strip() if custom_values.get(column) not in (None, "") else None
        for column in custom_columns
    }
    image_insert_values = {
        column: None
        for column in WEIGHMENT_CAMERA_IMAGE_COLUMNS.values()
    }
    insert_values = {**base_values, **image_insert_values, **custom_insert_values}
    column_sql = ", ".join(quote_identifier(column) for column in insert_values)
    value_sql = ", ".join(f":{column}" for column in insert_values)

    entry_id = None
    try:
        if tare_weight_enabled and (is_empty_load or bool(payload.get("applyMasterTare")) or bool(payload.get("tareOverride"))) and weight_values["tare_weight"] is not None and vehicle_master is not None:
            vehicle_master.tare_weight = weight_values["tare_weight"]

        insert_result = db.session.execute(
            text(f"INSERT INTO {WEIGHMENT_TABLE} ({column_sql}) VALUES ({value_sql})"),
            insert_values,
        )
        entry_id = insert_result.lastrowid
        db.session.commit()
    except Exception as error:
        db.session.rollback()
        return jsonify({"message": "Failed to save weighment"}), 500

    if entry_id is None:
        entry_id = db.session.execute(
            text(
                f"""
                SELECT id
                FROM {WEIGHMENT_TABLE}
                WHERE serial_no = :serial_no
                  AND entry_date = :entry_date
                ORDER BY id DESC
                LIMIT 1
                """
            ),
            {
                "serial_no": base_values["serial_no"],
                "entry_date": base_values["entry_date"],
            },
        ).scalar()

    captured_images = {}
    failed_cameras = []
    attempted_cameras = 0

    if entry_id is not None:
        captured_images, failed_cameras, attempted_cameras = capture_weighment_camera_images(
            entry_id,
            base_values["entry_date"],
        )

    if entry_id is not None and captured_images:
        update_values = {
            **captured_images,
            "entry_id": entry_id,
            "updated_at": datetime.now(ZoneInfo("Asia/Kolkata")),
        }
        update_sql = ", ".join(
            f"{quote_identifier(column)} = :{column}"
            for column in captured_images
        )
        try:
            db.session.execute(
                text(
                    f"""
                    UPDATE {WEIGHMENT_TABLE}
                    SET {update_sql},
                        updated_at = :updated_at
                    WHERE id = :entry_id
                    """
                ),
                update_values,
            )
            db.session.commit()
        except Exception:
            db.session.rollback()

    if payment_mode == "CREDIT" and credit_row is not None:
        try:
            credit_row.used_amount = float(credit_row.used_amount or 0) + credit_payment_amount
            db.session.commit()
        except Exception:
            db.session.rollback()
            return jsonify({"message": "Failed to update credit usage"}), 500

    message = f"{base_values['serial_no']} saved successfully"
    if attempted_cameras:
        captured_count = len(captured_images)
        if captured_count == attempted_cameras:
            message = f"{message} with {captured_count} camera images"
        elif captured_count:
            message = f"{message}. Captured {captured_count} of {attempted_cameras} camera images"
        elif failed_cameras:
            message = f"{message}. Camera image capture failed"

    saved_entry = serialize_weighment_row(fetch_weighment_by_id(entry_id)) if entry_id is not None else None
    whatsapp_status = queue_whatsapp_message(saved_entry) if saved_entry else {"queued": False, "message": "Entry not available"}

    return jsonify({
        "message": message,
        "serialNo": base_values["serial_no"],
        "refNo": base_values["ref_no"],
        "capturedCameraCount": len(captured_images),
        "failedCameras": failed_cameras,
        "entry": saved_entry,
        "whatsapp": whatsapp_status,
    })


@weightment_bp.route("/api/weighments/<int:entry_id>/whatsapp/resend", methods=["POST"])
def weighment_whatsapp_resend(entry_id):
    ensure_weighment_schema()
    row = fetch_weighment_by_id(entry_id)
    if row is None:
        return jsonify({"message": "Weighment entry not found"}), 404

    entry = serialize_weighment_row(row)
    whatsapp_status = queue_whatsapp_message(entry, manual=True)
    if not whatsapp_status.get("queued"):
        return jsonify({"message": whatsapp_status.get("message") or "WhatsApp message not sent"}), 400

    return jsonify({
        "message": whatsapp_status.get("message") or "WhatsApp message queued",
        "whatsapp": whatsapp_status,
    })
