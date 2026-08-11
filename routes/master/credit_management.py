import re

from flask import jsonify, render_template, request
from sqlalchemy import text

from models.models import Credit_management, Customer_details, db
from . import master_bp


@master_bp.route("/credit-management")
def credit_management():
    return render_template("credit_management.html")


def normalize_credit_datetimes():
    db.session.execute(
        text(
            """
            UPDATE credit_management
            SET created_at = NULL
            WHERE TRIM(COALESCE(created_at, '')) = ''
            """
        )
    )
    db.session.execute(
        text(
            """
            UPDATE credit_management
            SET updated_at = NULL
            WHERE TRIM(COALESCE(updated_at, '')) = ''
            """
        )
    )
    db.session.commit()


def serialize_credit_row(row, index):
    total_credit = float(row.credit_amount or 0)
    used_credit = float(row.used_amount or 0)

    return {
        "id": row.id,
        "serialNo": str(index).zfill(2),
        "customerId": row.customer_id,
        "customerName": row.customer_details.customer_name if row.customer_details else "",
        "totalCredit": total_credit,
        "creditUsed": used_credit,
        "creditAvailable": max(total_credit - used_credit, 0),
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
    }


@master_bp.route("/api/customer-credits", methods=["GET"])
def credit_list():
    normalize_credit_datetimes()
    rows = (
        Credit_management.query
        .join(Customer_details, Credit_management.customer_id == Customer_details.id)
        .order_by(Credit_management.id.asc())
        .all()
    )

    return jsonify([
        serialize_credit_row(row, index)
        for index, row in enumerate(rows, start=1)
    ])


@master_bp.route("/api/customer-credits/<int:credit_id>/history", methods=["GET"])
def credit_history(credit_id):
    normalize_credit_datetimes()
    row = Credit_management.query.get(credit_id)
    if row is None:
        return jsonify({"message": "Credit entry not found"}), 404

    customer_name = row.customer_details.customer_name if row.customer_details else ""
    if not customer_name:
        return jsonify({
            "customerName": "",
            "history": [],
        })

    history_rows = db.session.execute(
        text(
            """
            SELECT
                vehicle_number,
                entry_date,
                entry_time,
                ref_no,
                charges,
                charge_1,
                payment_mode
            FROM weighment_entries
            WHERE UPPER(customer) = UPPER(:customer_name)
              AND UPPER(payment_mode) = 'CREDIT'
            ORDER BY entry_date DESC, id DESC
            """
        ),
        {"customer_name": customer_name},
    ).mappings().all()

    return jsonify({
        "customerName": customer_name,
        "history": [
            {
                "vehicleNo": re.sub(r"[^A-Z0-9]", "", (row["vehicle_number"] or "").upper()),
                "entryDate": row["entry_date"] or "",
                "entryTime": row["entry_time"] or "",
                "refNo": row["ref_no"] or "",
                "amount": float(row["charges"] or row["charge_1"] or 0),
            }
            for row in history_rows
        ],
    })


@master_bp.route("/api/customer-credits", methods=["POST"])
def credit_create():
    normalize_credit_datetimes()
    payload = request.get_json(silent=True) or {}

    customer_id = payload.get("customerId")
    credit_amount = payload.get("creditAmount")

    if customer_id in (None, ""):
        return jsonify({"message": "Customer is required"}), 400

    try:
        customer_id = int(customer_id)
    except (TypeError, ValueError):
        return jsonify({"message": "Customer is invalid"}), 400

    try:
        credit_amount = float(credit_amount)
    except (TypeError, ValueError):
        return jsonify({"message": "Credit amount must be a valid number"}), 400

    if credit_amount <= 0:
        return jsonify({"message": "Credit amount must be greater than zero"}), 400

    customer = Customer_details.query.get(customer_id)
    if customer is None:
        return jsonify({"message": "Customer not found"}), 404

    row = Credit_management.query.filter_by(customer_id=customer_id).first()

    if row is None:
        row = Credit_management(
            customer_id=customer_id,
            credit_amount=credit_amount,
            used_amount=0.0,
        )
        db.session.add(row)
        action = "saved"
    else:
        row.credit_amount = float(row.credit_amount or 0) + credit_amount
        action = "updated"

    db.session.commit()

    ordered_rows = Credit_management.query.order_by(Credit_management.id.asc()).all()
    row_index = next(
        index
        for index, candidate in enumerate(ordered_rows, start=1)
        if candidate.id == row.id
    )

    return jsonify(
        {
            "message": f"{customer.customer_name} credit {action}",
            "row": serialize_credit_row(row, row_index),
        }
    )


@master_bp.route("/api/customer-credits/<int:credit_id>", methods=["PUT"])
def credit_update(credit_id):
    normalize_credit_datetimes()
    row = Credit_management.query.get(credit_id)
    if row is None:
        return jsonify({"message": "Credit entry not found"}), 404

    payload = request.get_json(silent=True) or {}
    credit_amount = payload.get("creditAmount")

    try:
        credit_amount = float(credit_amount)
    except (TypeError, ValueError):
        return jsonify({"message": "Credit amount must be a valid number"}), 400

    if credit_amount <= 0:
        return jsonify({"message": "Credit amount must be greater than zero"}), 400

    used_amount = float(row.used_amount or 0)
    if credit_amount < used_amount:
        return jsonify({"message": "Total credit cannot be less than used credit"}), 400

    row.credit_amount = credit_amount
    db.session.commit()

    ordered_rows = Credit_management.query.order_by(Credit_management.id.asc()).all()
    row_index = next(
        index
        for index, candidate in enumerate(ordered_rows, start=1)
        if candidate.id == row.id
    )

    customer_name = row.customer_details.customer_name if row.customer_details else "Customer"
    return jsonify(
        {
            "message": f"{customer_name} credit updated",
            "row": serialize_credit_row(row, row_index),
        }
    )


@master_bp.route("/api/customer-credits/<int:credit_id>", methods=["DELETE"])
def credit_delete(credit_id):
    normalize_credit_datetimes()
    row = Credit_management.query.get(credit_id)
    if row is None:
        return jsonify({"message": "Credit entry not found"}), 404

    customer_name = row.customer_details.customer_name if row.customer_details else "Credit entry"
    db.session.delete(row)
    db.session.commit()

    return jsonify({"message": f"{customer_name} credit deleted"})
