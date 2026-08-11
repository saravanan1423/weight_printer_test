import re

from flask import jsonify, render_template, request
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import text

from models.models import db
from . import settings_bp

CUSTOM_FIELDS_TABLE = "custom_fields"
CUSTOM_FIELD_CONFIG_TABLE = "custom_field_config"
WEIGHMENT_TABLE = "weighment_entries"
BASE_COLUMNS = {"id", "created_at", "updated_at"}
MAX_CUSTOM_COLUMNS = 5
VALID_COLUMN_NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_ ]{0,39}$")
CUSTOM_FIELD_TYPES = {"text", "numeric", "date"}
CALCULATION_OPERATORS = {"add", "subtract", "multiply", "divide"}
DEFAULT_CALCULATION_OPERATOR = "add"
BUILTIN_FIELDS = [
    {"id": "builtin:vehicleNo", "label": "Vehicle No", "enabled": True, "required": True, "canDisable": False, "canChangeRequired": False},
    {"id": "builtin:vehicleType", "label": "Vehicle Type", "enabled": True, "required": False, "canDisable": True, "canChangeRequired": False},
    {"id": "builtin:weighingType", "label": "Weighing Type", "enabled": True, "required": True, "canDisable": False, "canChangeRequired": False},
    {"id": "builtin:material", "label": "Material", "enabled": True, "required": False, "canDisable": True, "canChangeRequired": True},
    {"id": "builtin:customer", "label": "Customer", "enabled": True, "required": False, "canDisable": True, "canChangeRequired": True},
    {"id": "builtin:mobileNo", "label": "Mobile No", "enabled": True, "required": False, "canDisable": True, "canChangeRequired": True},
    {"id": "builtin:paymentMode", "label": "Payment Mode", "enabled": True, "required": True, "canDisable": True, "canChangeRequired": False},
    {"id": "builtin:charges", "label": "Charges", "enabled": True, "required": False, "canDisable": True, "canChangeRequired": True},
    {"id": "builtin:camera", "label": "Camera", "enabled": True, "required": False, "canDisable": True, "canChangeRequired": False},
    {"id": "master:vehicleNumber", "label": "Vehicle Number", "enabled": True, "required": True, "canDisable": False, "canChangeRequired": False},
    {"id": "master:vehicleType", "label": "Vehicle Type", "enabled": True, "required": True, "canDisable": False, "canChangeRequired": False},
    {"id": "master:tareWeight", "label": "Tare Weight", "enabled": True, "required": True, "canDisable": True, "canChangeRequired": False},
    {"id": "master:rfid", "label": "RFID Number", "enabled": True, "required": False, "canDisable": True, "canChangeRequired": True},
    {"id": "master:vehicleTypeName", "label": "Vehicle Type Name", "enabled": True, "required": True, "canDisable": False, "canChangeRequired": False},
    {"id": "master:materialName", "label": "Material Name", "enabled": True, "required": True, "canDisable": False, "canChangeRequired": False},
    {"id": "master:customerName", "label": "Customer Name", "enabled": True, "required": True, "canDisable": False, "canChangeRequired": False},
    {"id": "master:mobileNumber", "label": "Mobile Number 1", "enabled": True, "required": False, "canDisable": True, "canChangeRequired": True},
    {"id": "master:mobileNumber2", "label": "Mobile Number 2", "enabled": True, "required": False, "canDisable": True, "canChangeRequired": True},
]


@settings_bp.route("/custom-field")
def custom_field():
    return render_template("custom_field_settings.html")


def quote_identifier(identifier):
    return '"' + identifier.replace('"', '""') + '"'


def db_column_to_ui_label(column_name):
    return column_name.replace("_", " ")


def ui_label_to_db_column(column_name):
    normalized = re.sub(r"\s+", " ", column_name.strip())
    return normalized.replace(" ", "_")


def get_custom_field_columns():
    rows = db.session.execute(text(f"PRAGMA table_info({CUSTOM_FIELDS_TABLE})")).mappings().all()
    return [row["name"] for row in rows]


def get_table_columns(table_name):
    rows = db.session.execute(text(f"PRAGMA table_info({table_name})")).mappings().all()
    return [row["name"] for row in rows]


def get_user_columns():
    return [column for column in get_custom_field_columns() if column not in BASE_COLUMNS]


def ensure_custom_field_config():
    db.session.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {CUSTOM_FIELD_CONFIG_TABLE} (
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
    config_columns = get_table_columns(CUSTOM_FIELD_CONFIG_TABLE)
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
    existing_config = {
        row["column_name"].lower()
        for row in db.session.execute(
            text(f"SELECT column_name FROM {CUSTOM_FIELD_CONFIG_TABLE}")
        ).mappings().all()
    }
    for field in BUILTIN_FIELDS:
        if field["id"].lower() in existing_config:
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
                "column_name": field["id"],
                "display_label": field["label"],
                "is_enabled": int(field["enabled"]),
                "is_required": int(field["required"]),
            },
        )
    for field in BUILTIN_FIELDS:
        assignments = []
        parameters = {"column_name": field["id"]}
        if not field["canDisable"]:
            assignments.append("is_enabled = :is_enabled")
            parameters["is_enabled"] = int(field["enabled"])
        if not field["canChangeRequired"]:
            assignments.append("is_required = :is_required")
            parameters["is_required"] = int(field["required"])
        if assignments:
            db.session.execute(
                text(
                    f"UPDATE {CUSTOM_FIELD_CONFIG_TABLE} "
                    f"SET {', '.join(assignments)} "
                    "WHERE lower(column_name) = lower(:column_name)"
                ),
                parameters,
            )
    for column in get_user_columns():
        if column.lower() in existing_config:
            continue
        db.session.execute(
            text(
                f"""
                INSERT INTO {CUSTOM_FIELD_CONFIG_TABLE}
                    (column_name, display_label, is_enabled, is_required)
                VALUES (:column_name, :display_label, 1, 0)
                """
            ),
            {"column_name": column, "display_label": db_column_to_ui_label(column)},
        )
    db.session.commit()


def get_custom_field_settings():
    ensure_custom_field_config()
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
    return settings


def validate_column_name(column_name):
    if not column_name:
        return "Column name is required"

    if not VALID_COLUMN_NAME_PATTERN.match(column_name):
        return "Column name must start with a letter and use only letters, numbers, spaces, or underscores"

    db_column_name = ui_label_to_db_column(column_name)

    if db_column_name.lower() in BASE_COLUMNS:
        return "Column name is reserved"

    return None


def normalize_field_type(value):
    normalized = str(value or "text").strip().lower()
    return normalized if normalized in CUSTOM_FIELD_TYPES else "text"


def normalize_calculation_source(value):
    return ui_label_to_db_column(str(value or "").strip()) if str(value or "").strip() else ""


def normalize_calculation_operator(value):
    normalized = str(value or DEFAULT_CALCULATION_OPERATOR).strip().lower()
    return normalized if normalized in CALCULATION_OPERATORS else DEFAULT_CALCULATION_OPERATOR


def numeric_custom_columns(settings=None):
    settings = settings or get_custom_field_settings()
    return {
        column
        for column in get_user_columns()
        if normalize_field_type(settings.get(column.lower(), {}).get("field_type")) == "numeric"
    }


def validate_calculation_sources(left, right, *, current_column="", settings=None):
    left = normalize_calculation_source(left)
    right = normalize_calculation_source(right)
    if not left and not right:
        return "", "", None
    if not left or not right:
        return left, right, "Choose both calculation fields"
    numeric_columns = numeric_custom_columns(settings)
    if current_column:
        numeric_columns.discard(current_column)
    if left not in numeric_columns or right not in numeric_columns:
        return left, right, "Calculation fields must be existing numeric custom fields"
    if left == right:
        return left, right, "Choose two different numeric fields"
    return left, right, None


def execute_custom_field_ddl(statement, failure_message):
    try:
        db.session.execute(text(statement))
        db.session.commit()
        return None
    except SQLAlchemyError:
        db.session.rollback()
        return failure_message


def add_weighment_custom_column(column_name):
    if column_name in get_table_columns(WEIGHMENT_TABLE):
        return None
    return execute_custom_field_ddl(
        f"ALTER TABLE {WEIGHMENT_TABLE} "
        f"ADD COLUMN {quote_identifier(column_name)} TEXT DEFAULT NULL",
        "Failed to create weighment column"
    )


def rename_weighment_custom_column(current_column, next_column):
    weighment_columns = get_table_columns(WEIGHMENT_TABLE)
    if current_column not in weighment_columns:
        return add_weighment_custom_column(next_column)
    return execute_custom_field_ddl(
        f"ALTER TABLE {WEIGHMENT_TABLE} "
        f"RENAME COLUMN {quote_identifier(current_column)} "
        f"TO {quote_identifier(next_column)}",
        "Failed to rename weighment column"
    )


def delete_weighment_custom_column(column_name):
    if column_name not in get_table_columns(WEIGHMENT_TABLE):
        return None
    return execute_custom_field_ddl(
        f"ALTER TABLE {WEIGHMENT_TABLE} "
        f"DROP COLUMN {quote_identifier(column_name)}",
        "Failed to delete weighment column"
    )


@settings_bp.route("/api/custom-fields", methods=["GET"])
def custom_field_list():
    columns = get_user_columns()
    settings = get_custom_field_settings()
    builtin_rows = [
        {
            "id": field["id"],
            "serialNo": str(index).zfill(2),
            "columnName": settings[field["id"].lower()]["display_label"],
            "enabled": bool(settings[field["id"].lower()]["is_enabled"]),
            "required": bool(settings[field["id"].lower()]["is_required"]),
            "isBuiltIn": True,
            "canDisable": field["canDisable"],
            "canChangeRequired": field["canChangeRequired"],
            "scope": "Master" if field["id"].startswith("master:") else "Weighment",
        }
        for index, field in enumerate(BUILTIN_FIELDS, start=1)
    ]
    custom_rows = [
        {
            "id": column,
            "serialNo": str(index + len(builtin_rows)).zfill(2),
            "columnName": settings[column.lower()]["display_label"],
            "enabled": bool(settings[column.lower()]["is_enabled"]),
            "required": bool(settings[column.lower()]["is_required"]),
            "fieldType": normalize_field_type(settings[column.lower()]["field_type"]),
            "calculationLeft": settings[column.lower()]["calculation_left"] or "",
            "calculationRight": settings[column.lower()]["calculation_right"] or "",
            "calculationOperator": normalize_calculation_operator(settings[column.lower()]["calculation_operator"]),
            "isBuiltIn": False,
            "canDisable": True,
            "canChangeRequired": True,
            "scope": "Custom",
        }
        for index, column in enumerate(columns, start=1)
    ]
    return jsonify([*builtin_rows, *custom_rows])


@settings_bp.route("/api/custom-fields", methods=["POST"])
def custom_field_create():
    payload = request.get_json(silent=True) or {}
    column_name = re.sub(r"\s+", " ", (payload.get("columnName") or "").strip())
    is_enabled = payload.get("enabled") is not False
    is_required = bool(payload.get("required")) and is_enabled
    field_type = normalize_field_type(payload.get("fieldType"))
    calculation_operator = normalize_calculation_operator(payload.get("calculationOperator"))
    settings = get_custom_field_settings()
    calculation_left, calculation_right, calculation_error = validate_calculation_sources(
        payload.get("calculationLeft"),
        payload.get("calculationRight"),
        settings=settings,
    )
    if field_type != "numeric":
        calculation_left = ""
        calculation_right = ""
    elif calculation_error:
        return jsonify({"message": calculation_error}), 400

    validation_message = validate_column_name(column_name)
    if validation_message:
        return jsonify({"message": validation_message}), 400

    db_column_name = ui_label_to_db_column(column_name)
    columns = get_user_columns()
    if len(columns) >= MAX_CUSTOM_COLUMNS:
        return jsonify({"message": "Maximum 5 columns allowed"}), 409

    if any(existing.lower() == db_column_name.lower() for existing in columns):
        return jsonify({"message": "Column name already exists"}), 409

    failure_message = execute_custom_field_ddl(
        f"ALTER TABLE {CUSTOM_FIELDS_TABLE} "
        f"ADD COLUMN {quote_identifier(db_column_name)} TEXT",
        "Failed to create column"
    )
    if failure_message:
        return jsonify({"message": failure_message}), 500

    failure_message = add_weighment_custom_column(db_column_name)
    if failure_message:
        return jsonify({"message": failure_message}), 500

    ensure_custom_field_config()
    db.session.execute(
        text(
            f"""
            UPDATE {CUSTOM_FIELD_CONFIG_TABLE}
            SET display_label = :display_label,
                is_enabled = :is_enabled,
                is_required = :is_required,
                field_type = :field_type,
                calculation_left = :calculation_left,
                calculation_right = :calculation_right,
                calculation_operator = :calculation_operator
            WHERE column_name = :column_name
            """
        ),
        {
            "column_name": db_column_name,
            "display_label": column_name,
            "is_enabled": int(is_enabled),
            "is_required": int(is_required),
            "field_type": field_type,
            "calculation_left": calculation_left or None,
            "calculation_right": calculation_right or None,
            "calculation_operator": calculation_operator,
        },
    )
    db.session.commit()

    return jsonify({
        "message": f"{column_name} column created",
        "row": {
            "id": db_column_name,
            "columnName": column_name,
            "enabled": is_enabled,
            "required": is_required,
            "fieldType": field_type,
            "calculationLeft": calculation_left,
            "calculationRight": calculation_right,
            "calculationOperator": calculation_operator,
        },
    })


@settings_bp.route("/api/custom-fields/<string:column_name>", methods=["PUT"])
def custom_field_update(column_name):
    payload = request.get_json(silent=True) or {}
    next_column_name = re.sub(r"\s+", " ", (payload.get("columnName") or "").strip())
    is_enabled = payload.get("enabled") is not False
    is_required = bool(payload.get("required")) and is_enabled
    field_type = normalize_field_type(payload.get("fieldType"))
    calculation_operator = normalize_calculation_operator(payload.get("calculationOperator"))

    builtin_field = next((field for field in BUILTIN_FIELDS if field["id"].lower() == column_name.lower()), None)
    if builtin_field is not None:
        validation_message = validate_column_name(next_column_name)
        if validation_message:
            return jsonify({"message": validation_message}), 400
        if not builtin_field["canDisable"]:
            is_enabled = True
        if not builtin_field["canChangeRequired"]:
            is_required = builtin_field["required"]
        if not is_enabled:
            is_required = False
        ensure_custom_field_config()
        db.session.execute(
            text(
                f"""
                UPDATE {CUSTOM_FIELD_CONFIG_TABLE}
                SET display_label = :display_label,
                    is_enabled = :is_enabled,
                    is_required = :is_required
                WHERE lower(column_name) = lower(:column_name)
                """
            ),
            {
                "column_name": builtin_field["id"],
                "display_label": next_column_name,
                "is_enabled": int(is_enabled),
                "is_required": int(is_required),
            },
        )
        db.session.commit()
        if builtin_field["id"] in {"master:tareWeight", "master:rfid"}:
            from admin_config import RFID_ENABLED_KEY, TARE_WEIGHT_ENABLED_KEY, set_admin_setting_bool
            setting_key = TARE_WEIGHT_ENABLED_KEY if builtin_field["id"] == "master:tareWeight" else RFID_ENABLED_KEY
            set_admin_setting_bool(setting_key, is_enabled)
        return jsonify({
            "message": f"{next_column_name} updated",
            "row": {
                "id": builtin_field["id"],
                "columnName": next_column_name,
                "enabled": is_enabled,
                "required": is_required,
                "isBuiltIn": True,
                "canDisable": builtin_field["canDisable"],
                "canChangeRequired": builtin_field["canChangeRequired"],
            },
        })

    current_columns = get_user_columns()
    current_column = next((item for item in current_columns if item.lower() == column_name.lower()), None)
    if current_column is None:
        return jsonify({"message": "Column not found"}), 404

    validation_message = validate_column_name(next_column_name)
    if validation_message:
        return jsonify({"message": validation_message}), 400

    next_db_column_name = ui_label_to_db_column(next_column_name)
    duplicate_column = next(
        (item for item in current_columns if item.lower() == next_db_column_name.lower() and item.lower() != current_column.lower()),
        None
    )
    if duplicate_column is not None:
        return jsonify({"message": "Column name already exists"}), 409

    ensure_custom_field_config()
    target_column = current_column
    settings = get_custom_field_settings()
    calculation_left, calculation_right, calculation_error = validate_calculation_sources(
        payload.get("calculationLeft"),
        payload.get("calculationRight"),
        current_column=current_column,
        settings=settings,
    )
    if field_type != "numeric":
        calculation_left = ""
        calculation_right = ""
    elif calculation_error:
        return jsonify({"message": calculation_error}), 400

    if current_column.lower() != next_db_column_name.lower():
        failure_message = execute_custom_field_ddl(
            f"ALTER TABLE {CUSTOM_FIELDS_TABLE} "
            f"RENAME COLUMN {quote_identifier(current_column)} "
            f"TO {quote_identifier(next_db_column_name)}",
            "Failed to rename column"
        )
        if failure_message:
            return jsonify({"message": failure_message}), 500

        failure_message = rename_weighment_custom_column(current_column, next_db_column_name)
        if failure_message:
            return jsonify({"message": failure_message}), 500
        target_column = next_db_column_name

    db.session.execute(
        text(
            f"""
            UPDATE {CUSTOM_FIELD_CONFIG_TABLE}
            SET column_name = :next_column,
                display_label = :display_label,
                is_enabled = :is_enabled,
                is_required = :is_required,
                field_type = :field_type,
                calculation_left = :calculation_left,
                calculation_right = :calculation_right,
                calculation_operator = :calculation_operator
            WHERE lower(column_name) = lower(:current_column)
            """
        ),
        {
            "current_column": current_column,
            "next_column": target_column,
            "display_label": next_column_name,
            "is_enabled": int(is_enabled),
            "is_required": int(is_required),
            "field_type": field_type,
            "calculation_left": calculation_left or None,
            "calculation_right": calculation_right or None,
            "calculation_operator": calculation_operator,
        },
    )
    db.session.commit()

    return jsonify({
        "message": f"{current_column} renamed to {next_column_name}",
        "row": {
            "id": target_column,
            "columnName": next_column_name,
            "enabled": is_enabled,
            "required": is_required,
            "fieldType": field_type,
            "calculationLeft": calculation_left,
            "calculationRight": calculation_right,
            "calculationOperator": calculation_operator,
        },
    })


@settings_bp.route("/api/custom-fields/<string:column_name>", methods=["DELETE"])
def custom_field_delete(column_name):
    if any(field["id"].lower() == column_name.lower() for field in BUILTIN_FIELDS):
        return jsonify({"message": "Existing weighment fields cannot be deleted"}), 400
    ensure_custom_field_config()
    current_columns = get_user_columns()
    current_column = next((item for item in current_columns if item.lower() == column_name.lower()), None)
    if current_column is None:
        return jsonify({"message": "Column not found"}), 404

    failure_message = execute_custom_field_ddl(
        f"ALTER TABLE {CUSTOM_FIELDS_TABLE} "
        f"DROP COLUMN {quote_identifier(current_column)}",
        "Failed to delete column"
    )
    if failure_message:
        return jsonify({"message": failure_message}), 500

    failure_message = delete_weighment_custom_column(current_column)
    if failure_message:
        return jsonify({"message": failure_message}), 500

    db.session.execute(
        text(f"DELETE FROM {CUSTOM_FIELD_CONFIG_TABLE} WHERE lower(column_name) = lower(:column_name)"),
        {"column_name": current_column},
    )
    db.session.commit()

    return jsonify({"message": f"{current_column} deleted"})
