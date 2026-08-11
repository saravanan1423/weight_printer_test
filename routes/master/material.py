from flask import jsonify, render_template, request
from sqlalchemy import func, text

from models.models import Material_name, db
from . import master_bp


@master_bp.route("/material")
def item_master():
    return render_template("item_master.html")


def normalize_material_datetimes():
    db.session.execute(
        text(
            """
            UPDATE material_name
            SET created_at = NULL
            WHERE TRIM(COALESCE(created_at, '')) = ''
            """
        )
    )
    db.session.execute(
        text(
            """
            UPDATE material_name
            SET updated_at = NULL
            WHERE TRIM(COALESCE(updated_at, '')) = ''
            """
        )
    )
    db.session.commit()


@master_bp.route("/api/materials", methods=["GET"])
def material_list():
    normalize_material_datetimes()
    rows = Material_name.query.order_by(Material_name.id.asc()).all()
    return jsonify([
        {
            "id": row.id,
            "serialNo": str(index).zfill(2),
            "materialName": row.material_name,
            "createdAt": row.created_at.isoformat() if row.created_at else None,
            "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
        }
        for index, row in enumerate(rows, start=1)
    ])


@master_bp.route("/api/materials", methods=["POST"])
def material_create():
    normalize_material_datetimes()
    payload = request.get_json(silent=True) or {}
    material_name = (payload.get("materialName") or "").strip()

    if not material_name:
        return jsonify({"message": "Material is required"}), 400

    duplicate_query = Material_name.query.filter(
        func.lower(Material_name.material_name) == material_name.lower()
    )
    if duplicate_query.first():
        return jsonify({"message": "Material already exists"}), 409

    row = Material_name(material_name=material_name)
    db.session.add(row)
    db.session.commit()

    return jsonify(
        {
            "message": f"{material_name} saved",
            "row": {
                "id": row.id,
                "materialName": row.material_name,
                "createdAt": row.created_at.isoformat() if row.created_at else None,
                "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
            },
        }
    )


@master_bp.route("/api/materials/<int:material_id>", methods=["PUT"])
def material_update(material_id):
    normalize_material_datetimes()
    payload = request.get_json(silent=True) or {}
    material_name = (payload.get("materialName") or "").strip()

    if not material_name:
        return jsonify({"message": "Material is required"}), 400

    row = Material_name.query.get(material_id)
    if row is None:
        return jsonify({"message": "Material not found"}), 404

    duplicate_query = Material_name.query.filter(
        func.lower(Material_name.material_name) == material_name.lower(),
        Material_name.id != material_id,
    )
    if duplicate_query.first():
        return jsonify({"message": "Material already exists"}), 409

    row.material_name = material_name
    db.session.commit()

    return jsonify(
        {
            "message": f"{material_name} updated",
            "row": {
                "id": row.id,
                "materialName": row.material_name,
                "createdAt": row.created_at.isoformat() if row.created_at else None,
                "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
            },
        }
    )


@master_bp.route("/api/materials/<int:material_id>", methods=["DELETE"])
def material_delete(material_id):
    normalize_material_datetimes()
    row = Material_name.query.get(material_id)
    if row is None:
        return jsonify({"message": "Material not found"}), 404

    material_name = row.material_name
    db.session.delete(row)
    db.session.commit()

    return jsonify({"message": f"{material_name} deleted"})
