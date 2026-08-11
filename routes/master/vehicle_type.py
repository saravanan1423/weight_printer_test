from flask import jsonify, render_template, request
from sqlalchemy import func, text

from models.models import Vehicle_details, Vehicle_type, db
from . import master_bp

DEFAULT_VEHICLE_TYPES = [
    "Auto",
    "Lorry",
    "Taurus",
    "Tipper",
    "10 Wheeler",
    "12 Wheeler",
    "14 Wheeler",
    "16 Wheeler",
    "Tanker",
    "Tractor",
    "Container",
]


def ensure_default_vehicle_types():
    existing_names = {
        row.vehicle_name.strip().lower()
        for row in Vehicle_type.query.all()
    }
    added = False
    for vehicle_type_name in DEFAULT_VEHICLE_TYPES:
        if vehicle_type_name.lower() in existing_names:
            continue
        db.session.add(Vehicle_type(vehicle_name=vehicle_type_name))
        existing_names.add(vehicle_type_name.lower())
        added = True
    if added:
        db.session.commit()


def is_default_vehicle_type(vehicle_type_name):
    return (vehicle_type_name or "").strip().lower() in {
        item.lower() for item in DEFAULT_VEHICLE_TYPES
    }


@master_bp.route("/vehicle-type")
def vehicle_type():
    ensure_default_vehicle_types()
    return render_template("vehicle_type.html")


def normalize_vehicle_type_datetimes():
    db.session.execute(
        text(
            """
            UPDATE vehicle_type
            SET created_at = NULL
            WHERE TRIM(COALESCE(created_at, '')) = ''
            """
        )
    )
    db.session.execute(
        text(
            """
            UPDATE vehicle_type
            SET updated_at = NULL
            WHERE TRIM(COALESCE(updated_at, '')) = ''
            """
        )
    )
    db.session.commit()


@master_bp.route("/api/vehicle-types", methods=["GET"])
def vehicle_type_list():
    normalize_vehicle_type_datetimes()
    ensure_default_vehicle_types()
    rows = Vehicle_type.query.order_by(Vehicle_type.id.asc()).all()
    return jsonify([
        {
            "id": row.id,
            "serialNo": str(index).zfill(2),
            "vehicleTypeName": row.vehicle_name,
            "isDefault": is_default_vehicle_type(row.vehicle_name),
            "createdAt": row.created_at.isoformat() if row.created_at else None,
            "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
        }
        for index, row in enumerate(rows, start=1)
    ])


@master_bp.route("/api/vehicle-types", methods=["POST"])
def vehicle_type_create():
    normalize_vehicle_type_datetimes()
    payload = request.get_json(silent=True) or {}
    vehicle_type_name = (payload.get("vehicleTypeName") or "").strip()

    if not vehicle_type_name:
        return jsonify({"message": "Vehicle type is required"}), 400

    duplicate_query = Vehicle_type.query.filter(
        func.lower(Vehicle_type.vehicle_name) == vehicle_type_name.lower()
    )

    if duplicate_query.first():
        return jsonify({"message": "Vehicle type already exists"}), 409

    row = Vehicle_type(vehicle_name=vehicle_type_name)
    db.session.add(row)

    db.session.commit()

    return jsonify(
        {
            "message": f"{vehicle_type_name} saved",
            "row": {
                "id": row.id,
                "vehicleTypeName": row.vehicle_name,
                "createdAt": row.created_at.isoformat() if row.created_at else None,
                "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
            },
        }
    )


@master_bp.route("/api/vehicle-types/<int:vehicle_type_id>", methods=["PUT"])
def vehicle_type_update(vehicle_type_id):
    normalize_vehicle_type_datetimes()
    payload = request.get_json(silent=True) or {}
    vehicle_type_name = (payload.get("vehicleTypeName") or "").strip()

    if not vehicle_type_name:
        return jsonify({"message": "Vehicle type is required"}), 400

    row = Vehicle_type.query.get(vehicle_type_id)
    if row is None:
        return jsonify({"message": "Vehicle type not found"}), 404
    if is_default_vehicle_type(row.vehicle_name):
        return jsonify({"message": "Default vehicle types cannot be renamed"}), 400

    duplicate_query = Vehicle_type.query.filter(
        func.lower(Vehicle_type.vehicle_name) == vehicle_type_name.lower(),
        Vehicle_type.id != vehicle_type_id,
    )
    if duplicate_query.first():
        return jsonify({"message": "Vehicle type already exists"}), 409

    row.vehicle_name = vehicle_type_name
    db.session.commit()

    return jsonify(
        {
            "message": f"{vehicle_type_name} updated",
            "row": {
                "id": row.id,
                "vehicleTypeName": row.vehicle_name,
                "createdAt": row.created_at.isoformat() if row.created_at else None,
                "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
            },
        }
    )


@master_bp.route("/api/vehicle-types/<int:vehicle_type_id>", methods=["DELETE"])
def vehicle_type_delete(vehicle_type_id):
    normalize_vehicle_type_datetimes()
    row = Vehicle_type.query.get(vehicle_type_id)
    if row is None:
        return jsonify({"message": "Vehicle type not found"}), 404
    if is_default_vehicle_type(row.vehicle_name):
        return jsonify({"message": "Default vehicle types cannot be deleted"}), 400

    linked_vehicle = Vehicle_details.query.filter_by(vehicle_type_id=vehicle_type_id).first()
    if linked_vehicle is not None:
        return jsonify({
            "message": f"Vehicle type is used by vehicle {linked_vehicle.vehicle_number} and cannot be deleted"
        }), 409

    vehicle_type_name = row.vehicle_name
    db.session.delete(row)
    db.session.commit()

    return jsonify({"message": f"{vehicle_type_name} deleted"})
