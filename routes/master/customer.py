import re

from flask import jsonify, render_template, request
from sqlalchemy import func, text

from models.models import Customer_details, db
from . import master_bp


MOBILE_NUMBER_PATTERN = re.compile(r"^\d{10}$")
CUSTOMER_TABLE = "customer_details"


@master_bp.route("/customer")
def customer_master():
    return render_template("customer_master.html", customer_fields=get_customer_field_settings())


def get_customer_field_settings():
    from routes.settings.custom_field import get_custom_field_settings
    rows = get_custom_field_settings()
    return {
        key: {
            "label": rows[f"master:{key}".lower()]["display_label"],
            "enabled": bool(rows[f"master:{key}".lower()]["is_enabled"]),
            "required": bool(rows[f"master:{key}".lower()]["is_required"]),
        }
        for key in ("customerName", "mobileNumber", "mobileNumber2")
    }


def normalize_customer_datetimes():
    db.session.execute(
        text(
            """
            UPDATE customer_details
            SET created_at = NULL
            WHERE TRIM(COALESCE(created_at, '')) = ''
            """
        )
    )
    db.session.execute(
        text(
            """
            UPDATE customer_details
            SET updated_at = NULL
            WHERE TRIM(COALESCE(updated_at, '')) = ''
            """
        )
    )
    db.session.commit()


def ensure_customer_mobile_nullable():
    if db.engine.dialect.name != "sqlite":
        return

    column_info = db.session.execute(text(f"PRAGMA table_info({CUSTOMER_TABLE})")).mappings().all()
    mobile_column = next((row for row in column_info if row["name"] == "mobile_number"), None)
    if mobile_column is not None and mobile_column["notnull"] != 0:
        db.session.execute(text(f"ALTER TABLE {CUSTOMER_TABLE} RENAME TO {CUSTOMER_TABLE}_legacy"))
        db.session.execute(
            text(
                f"""
                CREATE TABLE {CUSTOMER_TABLE} (
                    id INTEGER NOT NULL,
                    customer_name VARCHAR(50) NOT NULL,
                    mobile_number VARCHAR(10),
                    mobile_number_2 VARCHAR(10),
                    created_at DATETIME,
                    updated_at DATETIME,
                    PRIMARY KEY (id)
                )
                """
            )
        )
        db.session.execute(
            text(
                f"""
                INSERT INTO {CUSTOMER_TABLE} (id, customer_name, mobile_number, created_at, updated_at)
                SELECT id, customer_name, mobile_number, created_at, updated_at
                FROM {CUSTOMER_TABLE}_legacy
                """
            )
        )
        db.session.execute(text(f"DROP TABLE {CUSTOMER_TABLE}_legacy"))
        db.session.commit()
        column_info = db.session.execute(text(f"PRAGMA table_info({CUSTOMER_TABLE})")).mappings().all()

    if not any(row["name"] == "mobile_number_2" for row in column_info):
        db.session.execute(text(f"ALTER TABLE {CUSTOMER_TABLE} ADD COLUMN mobile_number_2 VARCHAR(10)"))
        db.session.commit()


def validate_mobile_number(mobile_number):
    return bool(MOBILE_NUMBER_PATTERN.fullmatch(mobile_number))


@master_bp.route("/api/customers", methods=["GET"])
def customer_list():
    ensure_customer_mobile_nullable()
    normalize_customer_datetimes()
    rows = Customer_details.query.order_by(Customer_details.id.asc()).all()
    return jsonify([
        {
            "id": row.id,
            "serialNo": str(index).zfill(2),
            "customerName": row.customer_name,
            "mobileNumber": row.mobile_number,
            "mobileNumber2": row.mobile_number_2,
            "createdAt": row.created_at.isoformat() if row.created_at else None,
            "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
        }
        for index, row in enumerate(rows, start=1)
    ])


@master_bp.route("/api/customers", methods=["POST"])
def customer_create():
    ensure_customer_mobile_nullable()
    normalize_customer_datetimes()
    payload = request.get_json(silent=True) or {}
    customer_name = (payload.get("customerName") or "").strip()
    mobile_number = (payload.get("mobileNumber") or "").strip()
    mobile_number_2 = (payload.get("mobileNumber2") or "").strip()
    field_settings = get_customer_field_settings()
    if not field_settings["mobileNumber"]["enabled"]:
        mobile_number = ""
    if not field_settings["mobileNumber2"]["enabled"]:
        mobile_number_2 = ""

    if not customer_name:
        return jsonify({"message": "Customer name is required"}), 400
    if field_settings["mobileNumber"]["required"] and not mobile_number:
        return jsonify({"message": f"{field_settings['mobileNumber']['label']} is required"}), 400
    if field_settings["mobileNumber2"]["required"] and not mobile_number_2:
        return jsonify({"message": f"{field_settings['mobileNumber2']['label']} is required"}), 400

    if mobile_number and not validate_mobile_number(mobile_number):
        return jsonify({"message": "Mobile number must be exactly 10 digits"}), 400
    if mobile_number_2 and not validate_mobile_number(mobile_number_2):
        return jsonify({"message": "Mobile number 2 must be exactly 10 digits"}), 400

    duplicate_query = Customer_details.query.filter(
        func.lower(Customer_details.customer_name) == customer_name.lower(),
    )
    if duplicate_query.first():
        return jsonify({"message": "Customer already exists"}), 409

    row = Customer_details(customer_name=customer_name, mobile_number=mobile_number or None, mobile_number_2=mobile_number_2 or None)
    db.session.add(row)
    db.session.commit()

    return jsonify(
        {
            "message": f"{customer_name} saved",
            "row": {
                "id": row.id,
                "customerName": row.customer_name,
                "mobileNumber": row.mobile_number,
                "mobileNumber2": row.mobile_number_2,
                "createdAt": row.created_at.isoformat() if row.created_at else None,
                "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
            },
        }
    )


@master_bp.route("/api/customers/<int:customer_id>", methods=["PUT"])
def customer_update(customer_id):
    ensure_customer_mobile_nullable()
    normalize_customer_datetimes()
    payload = request.get_json(silent=True) or {}
    customer_name = (payload.get("customerName") or "").strip()
    mobile_number = (payload.get("mobileNumber") or "").strip()
    mobile_number_2 = (payload.get("mobileNumber2") or "").strip()
    field_settings = get_customer_field_settings()
    if not field_settings["mobileNumber"]["enabled"]:
        mobile_number = ""
    if not field_settings["mobileNumber2"]["enabled"]:
        mobile_number_2 = ""

    if not customer_name:
        return jsonify({"message": "Customer name is required"}), 400
    if field_settings["mobileNumber"]["required"] and not mobile_number:
        return jsonify({"message": f"{field_settings['mobileNumber']['label']} is required"}), 400
    if field_settings["mobileNumber2"]["required"] and not mobile_number_2:
        return jsonify({"message": f"{field_settings['mobileNumber2']['label']} is required"}), 400

    if mobile_number and not validate_mobile_number(mobile_number):
        return jsonify({"message": "Mobile number must be exactly 10 digits"}), 400
    if mobile_number_2 and not validate_mobile_number(mobile_number_2):
        return jsonify({"message": "Mobile number 2 must be exactly 10 digits"}), 400

    row = Customer_details.query.get(customer_id)
    if row is None:
        return jsonify({"message": "Customer not found"}), 404

    duplicate_query = Customer_details.query.filter(
        func.lower(Customer_details.customer_name) == customer_name.lower(),
        Customer_details.id != customer_id,
    )
    if duplicate_query.first():
        return jsonify({"message": "Customer already exists"}), 409

    row.customer_name = customer_name
    row.mobile_number = mobile_number or None
    row.mobile_number_2 = mobile_number_2 or None
    db.session.commit()

    return jsonify(
        {
            "message": f"{customer_name} updated",
            "row": {
                "id": row.id,
                "customerName": row.customer_name,
                "mobileNumber": row.mobile_number,
                "mobileNumber2": row.mobile_number_2,
                "createdAt": row.created_at.isoformat() if row.created_at else None,
                "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
            },
        }
    )


@master_bp.route("/api/customers/<int:customer_id>", methods=["DELETE"])
def customer_delete(customer_id):
    normalize_customer_datetimes()
    row = Customer_details.query.get(customer_id)
    if row is None:
        return jsonify({"message": "Customer not found"}), 404

    customer_name = row.customer_name
    db.session.delete(row)
    db.session.commit()

    return jsonify({"message": f"{customer_name} deleted"})
