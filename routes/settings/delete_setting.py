from datetime import datetime
from zoneinfo import ZoneInfo

from flask import jsonify, render_template, request
from sqlalchemy import text

from routes.weightment.weightment import (
    WEIGHMENT_TABLE,
    ensure_weighment_schema,
    get_custom_field_column_names,
    normalize_vehicle_number,
    parse_optional_float,
    quote_identifier,
    serialize_weighment_row,
    validate_master_values,
)
from models.models import db

from . import settings_bp


DELETE_SETTING_PASSWORD = "sch admin"


@settings_bp.route("/delete-setting")
def delete_setting():
    ensure_weighment_schema()
    return render_template("delete_setting.html")


def normalize_delete_password(value):
    return " ".join(str(value or "").strip().lower().split())


def validate_delete_password(payload):
    entered_password = normalize_delete_password(payload.get("password"))
    return entered_password == DELETE_SETTING_PASSWORD


def fetch_weighment_rows(from_date=None, to_date=None):
    filters = []
    params = {}
    if from_date:
        filters.append("entry_date >= :from_date")
        params["from_date"] = from_date
    if to_date:
        filters.append("entry_date <= :to_date")
        params["to_date"] = to_date

    where_sql = f"WHERE {' AND '.join(filters)}" if filters else ""
    return db.session.execute(
        text(
            f"""
            SELECT *
            FROM {WEIGHMENT_TABLE}
            {where_sql}
            ORDER BY entry_date DESC, CAST(serial_no AS INTEGER) DESC, id DESC
            """
        ),
        params,
    ).mappings().all()


def fetch_weighment_by_id(weighment_id):
    return db.session.execute(
        text(f"SELECT * FROM {WEIGHMENT_TABLE} WHERE id = :id"),
        {"id": weighment_id},
    ).mappings().first()


def validate_weighment_payload(payload):
    required_fields = {
        "serialNo": "S.No is required",
        "refNo": "Ref No is required",
        "entryDate": "Date is required",
        "entryTime": "Time is required",
        "vehicleNo": "Vehicle number is required",
        "weighingType": "Weighing type is required",
        "paymentMode": "Payment mode is required",
    }

    for field, message in required_fields.items():
        if not str(payload.get(field) or "").strip():
            return message

    return None


def build_update_values(payload):
    now = datetime.now(ZoneInfo("Asia/Kolkata"))
    values = {
        "serial_no": (payload.get("serialNo") or "").strip(),
        "ref_no": (payload.get("refNo") or "").strip(),
        "entry_date": (payload.get("entryDate") or "").strip(),
        "entry_time": (payload.get("entryTime") or "").strip(),
        "vehicle_number": normalize_vehicle_number(payload.get("vehicleNo")),
        "weighing_type": (payload.get("weighingType") or "").strip(),
        "material": (payload.get("material") or "").strip(),
        "customer": (payload.get("customer") or "").strip(),
        "mobile_no": "".join(char for char in (payload.get("mobileNo") or "") if char.isdigit()),
        "payment_mode": (payload.get("paymentMode") or "").strip(),
        "charges": parse_optional_float(payload.get("charges")),
        "gross_weight": parse_optional_float(payload.get("grossWeight")),
        "gross_date": (payload.get("grossDate") or "").strip() or None,
        "gross_time": (payload.get("grossTime") or "").strip() or None,
        "tare_weight": parse_optional_float(payload.get("tareWeight")),
        "tare_date": (payload.get("tareDate") or "").strip() or None,
        "tare_time": (payload.get("tareTime") or "").strip() or None,
        "net_weight": parse_optional_float(payload.get("netWeight")),
        "updated_at": now,
    }
    custom_values = payload.get("customFields") or {}
    for column in get_custom_field_column_names():
        values[column] = str(custom_values.get(column)).strip() if custom_values.get(column) not in (None, "") else None
    return values


@settings_bp.route("/api/delete-setting/weighments", methods=["GET"])
def delete_setting_weighment_list():
    ensure_weighment_schema()
    from_date = (request.args.get("fromDate") or "").strip()
    to_date = (request.args.get("toDate") or "").strip()
    rows = fetch_weighment_rows(from_date, to_date)
    return jsonify({
        "rows": [serialize_weighment_row(row) for row in rows],
        "customFieldColumns": get_custom_field_column_names(),
    })


@settings_bp.route("/api/delete-setting/weighments/<int:weighment_id>", methods=["PUT"])
def delete_setting_weighment_update(weighment_id):
    ensure_weighment_schema()
    if fetch_weighment_by_id(weighment_id) is None:
        return jsonify({"message": "Weighment entry not found"}), 404

    payload = request.get_json(silent=True) or {}
    validation_message = validate_weighment_payload(payload)
    if validation_message:
        return jsonify({"message": validation_message}), 400

    try:
        values = build_update_values(payload)
    except (TypeError, ValueError):
        return jsonify({"message": "Weight and charges must be valid numbers"}), 400

    assignments = ", ".join(f"{quote_identifier(column)} = :{column}" for column in values)
    values["id"] = weighment_id

    try:
        db.session.execute(
            text(f"UPDATE {WEIGHMENT_TABLE} SET {assignments} WHERE id = :id"),
            values,
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"message": "Failed to update weighment"}), 500

    row = fetch_weighment_by_id(weighment_id)
    return jsonify({
        "message": f"{values['serial_no']} updated",
        "entry": serialize_weighment_row(row),
    })


@settings_bp.route("/api/delete-setting/weighments/<int:weighment_id>", methods=["DELETE"])
def delete_setting_weighment_delete(weighment_id):
    ensure_weighment_schema()
    row = fetch_weighment_by_id(weighment_id)
    if row is None:
        return jsonify({"message": "Weighment entry not found"}), 404

    payload = request.get_json(silent=True) or {}
    if not validate_delete_password(payload):
        return jsonify({"message": "Delete password is incorrect"}), 403

    serial_no = row["serial_no"] or "Entry"
    try:
        db.session.execute(
            text(f"DELETE FROM {WEIGHMENT_TABLE} WHERE id = :id"),
            {"id": weighment_id},
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"message": "Failed to delete weighment"}), 500

    return jsonify({"message": f"{serial_no} deleted"})


@settings_bp.route("/api/delete-setting/weighments/bulk-delete", methods=["POST"])
def delete_setting_weighment_bulk_delete():
    ensure_weighment_schema()
    payload = request.get_json(silent=True) or {}
    if not validate_delete_password(payload):
        return jsonify({"message": "Delete password is incorrect"}), 403

    raw_ids = payload.get("ids") or []
    try:
        weighment_ids = sorted({int(value) for value in raw_ids})
    except (TypeError, ValueError):
        return jsonify({"message": "Select valid weighment entries"}), 400

    if not weighment_ids:
        return jsonify({"message": "Select at least one weighment entry"}), 400

    placeholders = ", ".join(f":id_{index}" for index, _ in enumerate(weighment_ids))
    params = {f"id_{index}": weighment_id for index, weighment_id in enumerate(weighment_ids)}

    try:
        result = db.session.execute(
            text(f"DELETE FROM {WEIGHMENT_TABLE} WHERE id IN ({placeholders})"),
            params,
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"message": "Failed to delete selected weighments"}), 500

    deleted_count = result.rowcount if result.rowcount is not None else len(weighment_ids)
    return jsonify({"message": f"{deleted_count} weighment entries deleted"})
