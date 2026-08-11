import re

from flask import jsonify, render_template, request
from sqlalchemy import func, text

from models.models import Vehicle_details, Vehicle_type, db
from admin_config import get_tare_weight_enabled
from . import master_bp


VEHICLE_NUMBER_PATTERN = re.compile(r"^[A-Z0-9]{6,12}$")
VEHICLE_DETAILS_TABLE = "vehicle_details"


@master_bp.route("/vehicle-number")
def vehicle_number():
    return render_template("vehicle_number.html")


def normalize_vehicle_details_datetimes():
    ensure_vehicle_number_capacity()
    db.session.execute(
        text(
            """
            UPDATE vehicle_details
            SET created_at = NULL
            WHERE TRIM(COALESCE(created_at, '')) = ''
            """
        )
    )
    db.session.execute(
        text(
            """
            UPDATE vehicle_details
            SET updated_at = NULL
            WHERE TRIM(COALESCE(updated_at, '')) = ''
            """
        )
    )
    db.session.commit()


def ensure_vehicle_number_capacity():
    if db.engine.dialect.name != "sqlite":
        return

    columns = db.session.execute(text(f"PRAGMA table_info({VEHICLE_DETAILS_TABLE})")).mappings().all()
    vehicle_column = next((row for row in columns if row["name"] == "vehicle_number"), None)
    declared_type = str(vehicle_column["type"] or "").upper() if vehicle_column else ""
    if vehicle_column is None or "(12)" in declared_type:
        return

    legacy_table = f"{VEHICLE_DETAILS_TABLE}_legacy"
    db.session.execute(text(f"DROP TABLE IF EXISTS {legacy_table}"))
    db.session.execute(text(f"ALTER TABLE {VEHICLE_DETAILS_TABLE} RENAME TO {legacy_table}"))
    db.session.execute(
        text(
            f"""
            CREATE TABLE {VEHICLE_DETAILS_TABLE} (
                id INTEGER NOT NULL,
                vehicle_number VARCHAR(12) NOT NULL,
                rfi_number VARCHAR(30),
                tare_weight FLOAT NOT NULL DEFAULT 0,
                vehicle_type_id INTEGER NOT NULL,
                created_at DATETIME,
                updated_at DATETIME,
                PRIMARY KEY (id),
                UNIQUE (vehicle_number),
                FOREIGN KEY(vehicle_type_id) REFERENCES vehicle_type (id)
            )
            """
        )
    )
    db.session.execute(
        text(
            f"""
            INSERT INTO {VEHICLE_DETAILS_TABLE}
                (id, vehicle_number, rfi_number, tare_weight, vehicle_type_id, created_at, updated_at)
            SELECT id, vehicle_number, rfi_number, tare_weight, vehicle_type_id, created_at, updated_at
            FROM {legacy_table}
            """
        )
    )
    db.session.execute(text(f"DROP TABLE {legacy_table}"))
    db.session.commit()


def normalize_vehicle_number(value):
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def normalize_rfi_number(value):
    rfi_number = (value or "").strip().upper()
    return None if rfi_number in {"", "0"} else rfi_number


def serialize_rfi_number(value):
    rfi_number = (value or "").strip()
    return "" if rfi_number in {"", "0"} else rfi_number


def next_rfi_number():
    rows = Vehicle_details.query.with_entities(Vehicle_details.rfi_number).all()
    max_rfi = 0
    for (value,) in rows:
        rfi_number = serialize_rfi_number(value)
        if not rfi_number.isdigit():
            continue
        max_rfi = max(max_rfi, int(rfi_number))
    return str(max_rfi + 1)


def is_valid_vehicle_number(value):
    return bool(VEHICLE_NUMBER_PATTERN.fullmatch(value))


def resolve_vehicle_type(payload):
    vehicle_type_name = (payload.get("vehicleTypeName") or "").strip()
    vehicle_type_id = payload.get("vehicleTypeId")

    if vehicle_type_name:
        vehicle_type = Vehicle_type.query.filter(
            func.lower(Vehicle_type.vehicle_name) == vehicle_type_name.lower()
        ).first()
        if vehicle_type is None:
            vehicle_type = Vehicle_type(vehicle_name=vehicle_type_name)
            db.session.add(vehicle_type)
            db.session.flush()
        return vehicle_type

    try:
        vehicle_type_id = int(vehicle_type_id)
    except (TypeError, ValueError):
        return None

    return Vehicle_type.query.get(vehicle_type_id)


@master_bp.route("/api/vehicles", methods=["GET"])
def vehicle_list():
    normalize_vehicle_details_datetimes()
    rows = Vehicle_details.query.order_by(Vehicle_details.id.asc()).all()
    return jsonify([
        {
            "id": row.id,
            "serialNo": str(index).zfill(2),
            "vehicleNumber": normalize_vehicle_number(row.vehicle_number),
            "rfiNumber": serialize_rfi_number(row.rfi_number),
            "tareWeight": row.tare_weight,
            "vehicleTypeId": row.vehicle_type_id,
            "vehicleTypeName": row.vehicle_type.vehicle_name if row.vehicle_type else "",
            "createdAt": row.created_at.isoformat() if row.created_at else None,
            "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
        }
        for index, row in enumerate(rows, start=1)
    ])


@master_bp.route("/api/vehicles/next-rfi", methods=["GET"])
def vehicle_next_rfi():
    normalize_vehicle_details_datetimes()
    return jsonify({"rfiNumber": next_rfi_number()})


@master_bp.route("/api/vehicles", methods=["POST"])
def vehicle_create():
    normalize_vehicle_details_datetimes()
    payload = request.get_json(silent=True) or {}

    vehicle_number = normalize_vehicle_number(payload.get("vehicleNumber"))
    rfi_number = normalize_rfi_number(payload.get("rfiNumber")) or next_rfi_number()
    tare_weight = payload.get("tareWeight")
    vehicle_type = resolve_vehicle_type(payload)

    if not is_valid_vehicle_number(vehicle_number):
        return jsonify({"message": "Vehicle number must contain 6 to 12 letters or numbers"}), 400

    tare_weight_enabled = get_tare_weight_enabled()
    if tare_weight_enabled and tare_weight in (None, ""):
        return jsonify({"message": "Tare weight is required"}), 400

    if tare_weight_enabled:
        try:
            tare_weight = float(tare_weight)
        except (TypeError, ValueError):
            return jsonify({"message": "Tare weight must be a valid number"}), 400
    else:
        tare_weight = 0.0

    if tare_weight < 0:
        return jsonify({"message": "Tare weight cannot be negative"}), 400

    if vehicle_type is None:
        return jsonify({"message": "Vehicle type is required"}), 400

    if Vehicle_details.query.filter(
        func.upper(Vehicle_details.vehicle_number) == vehicle_number
    ).first():
        return jsonify({"message": "Vehicle number already exists"}), 409

    row = Vehicle_details(
        vehicle_number=vehicle_number,
        rfi_number=rfi_number,
        tare_weight=tare_weight,
        vehicle_type_id=vehicle_type.id,
    )
    db.session.add(row)
    db.session.commit()

    return jsonify(
        {
            "message": f"{vehicle_number} saved",
            "row": {
                "id": row.id,
                "vehicleNumber": row.vehicle_number,
                "rfiNumber": serialize_rfi_number(row.rfi_number),
                "tareWeight": row.tare_weight,
                "vehicleTypeId": row.vehicle_type_id,
                "vehicleTypeName": row.vehicle_type.vehicle_name if row.vehicle_type else "",
                "createdAt": row.created_at.isoformat() if row.created_at else None,
                "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
            },
        }
    )


@master_bp.route("/api/vehicles/<int:vehicle_id>", methods=["PUT"])
def vehicle_update(vehicle_id):
    normalize_vehicle_details_datetimes()
    payload = request.get_json(silent=True) or {}

    vehicle_number = normalize_vehicle_number(payload.get("vehicleNumber"))
    rfi_number = normalize_rfi_number(payload.get("rfiNumber"))
    tare_weight = payload.get("tareWeight")
    vehicle_type = resolve_vehicle_type(payload)

    if not is_valid_vehicle_number(vehicle_number):
        return jsonify({"message": "Vehicle number must contain 6 to 12 letters or numbers"}), 400

    row = Vehicle_details.query.get(vehicle_id)
    if row is None:
        return jsonify({"message": "Vehicle not found"}), 404

    tare_weight_enabled = get_tare_weight_enabled()
    if tare_weight_enabled and tare_weight in (None, ""):
        return jsonify({"message": "Tare weight is required"}), 400

    if tare_weight_enabled:
        try:
            tare_weight = float(tare_weight)
        except (TypeError, ValueError):
            return jsonify({"message": "Tare weight must be a valid number"}), 400
    else:
        tare_weight = float(row.tare_weight or 0)

    if tare_weight < 0:
        return jsonify({"message": "Tare weight cannot be negative"}), 400

    if vehicle_type is None:
        return jsonify({"message": "Vehicle type is required"}), 400

    if Vehicle_details.query.filter(
        func.upper(Vehicle_details.vehicle_number) == vehicle_number,
        Vehicle_details.id != vehicle_id,
    ).first():
        return jsonify({"message": "Vehicle number already exists"}), 409

    row.vehicle_number = vehicle_number
    row.rfi_number = rfi_number
    row.tare_weight = tare_weight
    row.vehicle_type_id = vehicle_type.id
    db.session.commit()

    return jsonify(
        {
            "message": f"{vehicle_number} updated",
            "row": {
                "id": row.id,
                "vehicleNumber": row.vehicle_number,
                "rfiNumber": serialize_rfi_number(row.rfi_number),
                "tareWeight": row.tare_weight,
                "vehicleTypeId": row.vehicle_type_id,
                "vehicleTypeName": row.vehicle_type.vehicle_name if row.vehicle_type else "",
                "createdAt": row.created_at.isoformat() if row.created_at else None,
                "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
            },
        }
    )


@master_bp.route("/api/vehicles/<int:vehicle_id>", methods=["DELETE"])
def vehicle_delete(vehicle_id):
    normalize_vehicle_details_datetimes()
    row = Vehicle_details.query.get(vehicle_id)
    if row is None:
        return jsonify({"message": "Vehicle not found"}), 404

    vehicle_number = row.vehicle_number
    db.session.delete(row)
    db.session.commit()

    return jsonify({"message": f"{vehicle_number} deleted"})
