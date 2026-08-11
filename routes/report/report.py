import json
import smtplib
import ssl
from datetime import datetime
from email.message import EmailMessage

from flask import Blueprint, jsonify, render_template, request
from sqlalchemy import text

from models.models import Email_error_log, Email_settings, Report_column_layout, db
from routes.weightment.weightment import (
    WEIGHMENT_TABLE,
    WEIGHMENT_CAMERA_IMAGE_COLUMNS,
    ensure_weighment_schema,
    get_custom_field_column_names,
    normalize_vehicle_number,
    quote_identifier,
    serialize_camera_images,
)

report_bp = Blueprint("report" , __name__)

MAX_REPORT_COLUMNS = 10
REPORT_LAYOUT_NAME = "default"
BASE_REPORT_COLUMN_KEYS = [
    "billNo",
    "refNo",
    "date",
    "time",
    "vehicleNo",
    "vehicleType",
    "weighingType",
    "material",
    "customer",
    "mobileNo",
    "payment",
    "paidAmt",
    "grossWt",
    "grossDate",
    "grossTime",
    "tareWt",
    "tareDate",
    "tareTime",
    "netWt",
    "status",
]
DEFAULT_REPORT_COLUMN_KEYS = [
    "date",
    "vehicleNo",
    "vehicleType",
    "vehicleNo",
    "customer",
    "material",
    "grossWt",
    "tareWt",
    "netWt",
    "paidAmt",
]
DEFAULT_SMTP_HOST = "smtp.gmail.com"
DEFAULT_SMTP_PORT = 587


def ensure_report_layout_table():
    db.create_all()


def valid_report_column_keys(custom_columns):
    return [*BASE_REPORT_COLUMN_KEYS, *[f"custom:{column}" for column in custom_columns]]


def normalize_report_layout(column_keys, custom_columns):
    valid_keys = valid_report_column_keys(custom_columns)
    normalized = []

    for key in column_keys or []:
        if key in valid_keys and key not in normalized:
            normalized.append(key)
        if len(normalized) == MAX_REPORT_COLUMNS:
            break

    if normalized:
        return normalized

    return [key for key in DEFAULT_REPORT_COLUMN_KEYS if key in valid_keys][:MAX_REPORT_COLUMNS]


def get_report_column_layout(custom_columns):
    ensure_report_layout_table()
    row = Report_column_layout.query.filter_by(layout_name=REPORT_LAYOUT_NAME).first()
    if row is None:
        return normalize_report_layout([], custom_columns)

    try:
        column_keys = json.loads(row.column_keys)
    except (TypeError, json.JSONDecodeError):
        column_keys = []

    return normalize_report_layout(column_keys, custom_columns)


def save_report_column_layout(column_keys, custom_columns):
    ensure_report_layout_table()
    normalized = normalize_report_layout(column_keys, custom_columns)
    row = Report_column_layout.query.filter_by(layout_name=REPORT_LAYOUT_NAME).first()

    if row is None:
        row = Report_column_layout(
            layout_name=REPORT_LAYOUT_NAME,
            column_keys=json.dumps(normalized),
        )
        db.session.add(row)
    else:
        row.column_keys = json.dumps(normalized)

    db.session.commit()
    return normalized


def normalize_log_message(message):
    return " ".join(str(message or "").split()).strip()


def add_report_email_log(message):
    normalized = normalize_log_message(message)
    if not normalized:
        return

    db.session.add(Email_error_log(error_log=normalized[:255]))
    db.session.commit()


def format_display_date(value):
    if not value:
        return ""
    parts = str(value).split("-")
    return f"{parts[2]}-{parts[1]}-{parts[0]}" if len(parts) == 3 else str(value)


def format_number(value):
    return f"{float(value or 0):,.0f}"


def format_amount(value):
    return f"{float(value or 0):.2f}"


def format_field_label(value):
    return str(value or "").replace("_", " ").title()


def stored_net_weight(saved_net_weight):
    try:
        return float(saved_net_weight or 0)
    except (TypeError, ValueError):
        return 0.0


def fetch_report_rows(from_date, to_date, custom_columns):
    filters = []
    params = {}
    if from_date:
        filters.append("entry_date >= :from_date")
        params["from_date"] = from_date
    if to_date:
        filters.append("entry_date <= :to_date")
        params["to_date"] = to_date

    where_sql = f"WHERE {' AND '.join(filters)}" if filters else ""
    select_columns = [
        f"{WEIGHMENT_TABLE}.id AS id",
        f"{WEIGHMENT_TABLE}.serial_no AS serial_no",
        f"{WEIGHMENT_TABLE}.ref_no AS ref_no",
        f"{WEIGHMENT_TABLE}.entry_date AS entry_date",
        f"{WEIGHMENT_TABLE}.entry_time AS entry_time",
        f"{WEIGHMENT_TABLE}.vehicle_number AS vehicle_number",
        f"{WEIGHMENT_TABLE}.weighing_type AS weighing_type",
        f"{WEIGHMENT_TABLE}.material AS material",
        f"{WEIGHMENT_TABLE}.customer AS customer",
        f"{WEIGHMENT_TABLE}.mobile_no AS mobile_no",
        f"{WEIGHMENT_TABLE}.mobile_no_2 AS mobile_no_2",
        f"{WEIGHMENT_TABLE}.payment_mode AS payment_mode",
        f"{WEIGHMENT_TABLE}.charge_1 AS charge_1",
        f"{WEIGHMENT_TABLE}.charge_2 AS charge_2",
        f"{WEIGHMENT_TABLE}.charges AS charges",
        f"{WEIGHMENT_TABLE}.gross_weight AS gross_weight",
        f"{WEIGHMENT_TABLE}.gross_date AS gross_date",
        f"{WEIGHMENT_TABLE}.gross_time AS gross_time",
        f"{WEIGHMENT_TABLE}.tare_weight AS tare_weight",
        f"{WEIGHMENT_TABLE}.tare_date AS tare_date",
        f"{WEIGHMENT_TABLE}.tare_time AS tare_time",
        f"{WEIGHMENT_TABLE}.net_weight AS net_weight",
        f"COALESCE(NULLIF({WEIGHMENT_TABLE}.vehicle_type_name, ''), vehicle_type.vehicle_name) AS vehicle_type_name",
        *WEIGHMENT_CAMERA_IMAGE_COLUMNS.values(),
        *[quote_identifier(column) for column in custom_columns],
    ]
    rows = db.session.execute(
        text(
            f"""
            SELECT {", ".join(select_columns)}
            FROM {WEIGHMENT_TABLE}
            LEFT JOIN vehicle_details ON UPPER(vehicle_details.vehicle_number) = UPPER({WEIGHMENT_TABLE}.vehicle_number)
            LEFT JOIN vehicle_type ON vehicle_type.id = vehicle_details.vehicle_type_id
            {where_sql}
            ORDER BY {WEIGHMENT_TABLE}.entry_date DESC, {WEIGHMENT_TABLE}.id DESC
            """
        ),
        params,
    ).mappings().all()

    grouped_rows = {}
    for row in rows:
        grouped_rows.setdefault(row["ref_no"] or "", []).append(row)

    carry_forward_by_id = {}
    for group_rows in grouped_rows.values():
        ordered_group = sorted(group_rows, key=lambda item: item["id"])
        previous_row = None

        for row in ordered_group:
            gross_weight = row["gross_weight"]
            gross_date = row["gross_date"] or ""
            gross_time = row["gross_time"] or ""
            tare_weight = row["tare_weight"]
            tare_date = row["tare_date"] or ""
            tare_time = row["tare_time"] or ""

            if previous_row is not None:
                if not gross_weight and previous_row["gross_weight"]:
                    gross_weight = previous_row["gross_weight"]
                    gross_date = previous_row["gross_date"] or ""
                    gross_time = previous_row["gross_time"] or ""

                if not tare_weight and previous_row["tare_weight"]:
                    tare_weight = previous_row["tare_weight"]
                    tare_date = previous_row["tare_date"] or ""
                    tare_time = previous_row["tare_time"] or ""

            carry_forward_by_id[row["id"]] = {
                "grossWt": gross_weight or 0,
                "grossDate": gross_date,
                "grossTime": gross_time,
                "tareWt": tare_weight or 0,
                "tareDate": tare_date,
                "tareTime": tare_time,
            }
            previous_row = {
                "gross_weight": gross_weight,
                "gross_date": gross_date,
                "gross_time": gross_time,
                "tare_weight": tare_weight,
                "tare_date": tare_date,
                "tare_time": tare_time,
            }

    report_rows = []
    for index, row in enumerate(rows, start=1):
        carried = carry_forward_by_id.get(row["id"], {})
        report_rows.append({
            "id": row["id"],
            "sNo": str(index),
            "billNo": row["serial_no"] or str(row["id"]),
            "refNo": row["ref_no"] or "",
            "date": row["entry_date"] or "",
            "time": row["entry_time"] or "",
            "customer": row["customer"] or "",
            "vehicleNo": normalize_vehicle_number(row["vehicle_number"]),
            "vehicleType": row["vehicle_type_name"] or "",
            "material": row["material"] or "",
            "netWt": stored_net_weight(row["net_weight"]),
            "payment": row["payment_mode"] or "",
            "paidAmt": row["charges"] or row["charge_1"] or 0,
            "status": "AUTOMATIC",
            "grossWt": carried.get("grossWt", row["gross_weight"] or 0),
            "grossDate": carried.get("grossDate", row["gross_date"] or ""),
            "grossTime": carried.get("grossTime", row["gross_time"] or ""),
            "tareWt": carried.get("tareWt", row["tare_weight"] or 0),
            "tareDate": carried.get("tareDate", row["tare_date"] or ""),
            "tareTime": carried.get("tareTime", row["tare_time"] or ""),
            "weighingType": row["weighing_type"] or "",
            "mobileNo": row["mobile_no"] or "",
            "mobileNo2": row["mobile_no_2"] or "",
            "charge1": row["charge_1"] or 0,
            "charge2": row["charge_2"] or 0,
            "cameraImages": serialize_camera_images(row),
            "customFields": {
                column: row[column]
                for column in custom_columns
                if column in row and row[column] not in (None, "")
            },
        })

    return report_rows


def report_column_definitions(custom_columns):
    columns = [
        ("billNo", "Bill No", lambda row: row["billNo"]),
        ("refNo", "Ref No", lambda row: row["refNo"]),
        ("date", "Date", lambda row: format_display_date(row["date"])),
        ("time", "Time", lambda row: row["time"]),
        ("vehicleNo", "Vehicle No", lambda row: row["vehicleNo"]),
        ("vehicleType", "Vehicle Type", lambda row: row["vehicleType"]),
        ("weighingType", "Weighing Type", lambda row: row["weighingType"]),
        ("material", "Material", lambda row: row["material"]),
        ("customer", "Customer", lambda row: row["customer"]),
        ("mobileNo", "Mobile No", lambda row: row["mobileNo"]),
        ("payment", "Payment", lambda row: row["payment"]),
        ("paidAmt", "Paid Amt", lambda row: format_amount(row["paidAmt"])),
        ("grossWt", "Gross Weight", lambda row: format_number(row["grossWt"])),
        ("grossDate", "Gross Date", lambda row: format_display_date(row["grossDate"])),
        ("grossTime", "Gross Time", lambda row: row["grossTime"]),
        ("tareWt", "Tare Weight", lambda row: format_number(row["tareWt"])),
        ("tareDate", "Tare Date", lambda row: format_display_date(row["tareDate"])),
        ("tareTime", "Tare Time", lambda row: row["tareTime"]),
        ("netWt", "Net Weight", lambda row: format_number(row["netWt"])),
        ("status", "Status", lambda row: row["status"]),
    ]

    for column in custom_columns:
        columns.append((
            f"custom:{column}",
            format_field_label(column),
            lambda row, column=column: (row.get("customFields") or {}).get(column, "-"),
        ))

    return columns


def selected_report_columns(column_keys, custom_columns):
    all_columns = report_column_definitions(custom_columns)
    by_key = {key: (key, label, getter) for key, label, getter in all_columns}
    normalized_keys = normalize_report_layout(column_keys, custom_columns)
    return [by_key[key] for key in normalized_keys if key in by_key]


def searchable_report_fields(row):
    return [
        row.get("billNo"),
        row.get("refNo"),
        row.get("date"),
        row.get("time"),
        row.get("customer"),
        row.get("vehicleNo"),
        row.get("vehicleType"),
        row.get("material"),
        row.get("netWt"),
        row.get("payment"),
        row.get("paidAmt"),
        row.get("status"),
        row.get("grossWt"),
        row.get("tareWt"),
        row.get("weighingType"),
        row.get("mobileNo"),
        row.get("mobileNo2"),
        row.get("charge1"),
        row.get("charge2"),
        *(row.get("customFields") or {}).values(),
    ]


def apply_report_filters(rows, payload):
    search = str(payload.get("search") or "").strip().upper()
    filters = payload.get("filters") or {}
    filter_map = {
        "customer": "customer",
        "vehicleNo": "vehicleNo",
        "material": "material",
        "vehicleType": "vehicleType",
        "payment": "payment",
        "status": "status",
    }

    filtered_rows = []
    for row in rows:
        if search and not any(search in str(value or "").upper() for value in searchable_report_fields(row)):
            continue

        matches_filters = True
        for filter_key, row_key in filter_map.items():
            value = str(filters.get(filter_key) or "").strip()
            if value and str(row.get(row_key) or "").upper() != value.upper():
                matches_filters = False
                break

        if matches_filters:
            filtered_rows.append(row)

    return filtered_rows


def report_summary(rows):
    return {
        "totalRecords": len(rows),
        "netWeight": sum(float(row.get("netWt") or 0) for row in rows),
        "totalAmount": sum(float(row.get("paidAmt") or 0) for row in rows),
    }


def pdf_escape(value):
    return str(value or "").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def pdf_cell_text(value, width, font_size):
    text = " ".join(str(value or "").split())
    max_chars = max(4, int(width / (font_size * 0.54)))
    if len(text) > max_chars:
        return f"{text[:max_chars - 1]}."
    return text


def pdf_text_x(x, width, value, font_size, alignment):
    text = " ".join(str(value or "").split())
    text_width = min(width - 8, max(0, len(text) * font_size * 0.54))

    if alignment == "center":
        return x + max(4, (width - text_width) / 2)
    if alignment == "right":
        return x + max(4, width - text_width - 4)
    return x + 4


def build_pdf_stream(lines):
    return "\n".join(lines).encode("latin-1", errors="replace")


def build_report_pdf(rows, columns, summary, from_date, to_date, alignment="left"):
    alignment = alignment if alignment in {"left", "center", "right"} else "left"
    page_width = 842
    page_height = 595
    margin = 26
    title_size = 16
    meta_size = 9
    table_size = 7
    row_height = 18
    header_height = 20
    table_top = page_height - 132
    table_bottom = margin + 18
    usable_width = page_width - (margin * 2)
    column_width = usable_width / max(len(columns), 1)
    rows_per_page = max(1, int((table_top - table_bottom - header_height) / row_height))
    date_label = f"{from_date or 'All dates'} to {to_date or 'All dates'}"
    pages = []

    for start in range(0, len(rows), rows_per_page):
        page_rows = rows[start:start + rows_per_page]
        page_number = len(pages) + 1
        lines = [
            "q",
            "0.96 0.98 1 rg",
            f"{margin} {page_height - 118} {usable_width} 34 re f",
            "0 0 0 rg",
            f"BT /F1 {title_size} Tf {margin} {page_height - 38} Td (Weighment Report) Tj ET",
            f"BT /F1 {meta_size} Tf {margin} {page_height - 58} Td (Date Range: {pdf_escape(date_label)}) Tj ET",
            f"BT /F1 {meta_size} Tf {margin} {page_height - 74} Td (Total Records: {summary['totalRecords']}) Tj ET",
            f"BT /F1 {meta_size} Tf {margin + 170} {page_height - 74} Td (Total Net Weight: {pdf_escape(format_number(summary['netWeight']))}) Tj ET",
            f"BT /F1 {meta_size} Tf {margin + 370} {page_height - 74} Td (Total Amount: {pdf_escape(format_amount(summary['totalAmount']))}) Tj ET",
            f"BT /F1 {meta_size} Tf {page_width - margin - 70} {page_height - 38} Td (Page {page_number}) Tj ET",
            "0.82 0.88 0.97 rg",
            f"{margin} {table_top - header_height} {usable_width} {header_height} re f",
            "0.55 0.61 0.70 RG",
            "0.5 w",
        ]

        x = margin
        printable_columns = [("sNo", "S.No", lambda row, index=None: row.get("sNo", "")), *columns]

        for _, label, _ in printable_columns:
            lines.extend([
                f"{x} {table_top - header_height} {column_width} {header_height} re S",
                "0 0 0 rg",
                f"BT /F1 {table_size} Tf {pdf_text_x(x, column_width, label, table_size, alignment)} {table_top - 13} Td ({pdf_escape(pdf_cell_text(label, column_width - 8, table_size))}) Tj ET",
            ])
            x += column_width

        y = table_top - header_height
        for row_index, row in enumerate(page_rows, start=start + 1):
            y -= row_height
            x = margin
            lines.append("1 1 1 rg")
            lines.append(f"{margin} {y} {usable_width} {row_height} re f")
            lines.append("0.55 0.61 0.70 RG")
            for key, _, getter in printable_columns:
                value = row.get("sNo") if key == "sNo" else getter(row)
                value = pdf_cell_text(value, column_width - 8, table_size)
                lines.extend([
                    f"{x} {y} {column_width} {row_height} re S",
                    "0 0 0 rg",
                    f"BT /F1 {table_size} Tf {pdf_text_x(x, column_width, value, table_size, alignment)} {y + 6} Td ({pdf_escape(value)}) Tj ET",
                ])
                x += column_width

        lines.append("Q")
        pages.append(build_pdf_stream(lines))

    return assemble_pdf(pages, page_width, page_height)


def assemble_pdf(page_streams, page_width, page_height):
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        None,
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    page_object_numbers = []

    for stream in page_streams:
        page_object_number = len(objects) + 1
        content_object_number = page_object_number + 1
        page_object_numbers.append(page_object_number)
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width} {page_height}] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_object_number} 0 R >>".encode("ascii")
        )
        objects.append(
            b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream"
        )

    kids = " ".join(f"{number} 0 R" for number in page_object_numbers)
    objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_object_numbers)} >>".encode("ascii")

    pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode("ascii"))
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(pdf)


def latest_email_settings():
    db.create_all()
    return Email_settings.query.order_by(
        Email_settings.updated_at.desc(),
        Email_settings.id.desc(),
    ).first()


def send_report_email(settings_row, rows, columns, summary, from_date, to_date, alignment="left"):
    date_label = f"{from_date or 'All dates'} to {to_date or 'All dates'}"
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    pdf_content = build_report_pdf(rows, columns, summary, from_date, to_date, alignment)

    message = EmailMessage()
    message["Subject"] = f"Weighment Report - {date_label}"
    message["From"] = settings_row.sender_email
    message["To"] = settings_row.test_recipient
    message.set_content(
        "\n".join([
            "Weighment report attached.",
            "",
            f"Date Range: {date_label}",
            f"Total Records: {summary['totalRecords']}",
            f"Total Net Weight: {format_number(summary['netWeight'])}",
            f"Total Amount: {format_amount(summary['totalAmount'])}",
        ])
    )
    message.add_attachment(
        pdf_content,
        maintype="application",
        subtype="pdf",
        filename=f"weighment-report-{timestamp}.pdf",
    )

    context = ssl.create_default_context()
    username = settings_row.username or settings_row.sender_email
    with smtplib.SMTP(DEFAULT_SMTP_HOST, DEFAULT_SMTP_PORT, timeout=20) as server:
        server.starttls(context=context)
        server.login(username, settings_row.password)
        server.sendmail(settings_row.sender_email, settings_row.test_recipient, message.as_string())

@report_bp.route("/reports")
def report():

    return render_template("reports.html")


@report_bp.route("/reports/api/weighments", methods=["GET"])
def report_weighments():
    ensure_weighment_schema()

    from_date = (request.args.get("fromDate") or "").strip()
    to_date = (request.args.get("toDate") or "").strip()
    custom_columns = get_custom_field_column_names()
    report_rows = fetch_report_rows(from_date, to_date, custom_columns)

    return jsonify({
        "rows": report_rows,
        "customFieldColumns": custom_columns,
        "columnLayout": get_report_column_layout(custom_columns),
    })


@report_bp.route("/reports/api/column-layout", methods=["POST"])
def report_column_layout():
    custom_columns = get_custom_field_column_names()
    payload = request.get_json(silent=True) or {}
    column_keys = payload.get("columnKeys")

    if not isinstance(column_keys, list):
        return jsonify({"message": "Column layout is required"}), 400

    normalized = save_report_column_layout(column_keys, custom_columns)
    return jsonify({
        "message": "Column layout saved",
        "columnLayout": normalized,
    })


@report_bp.route("/reports/api/email", methods=["POST"])
def report_email():
    ensure_weighment_schema()
    payload = request.get_json(silent=True) or {}
    from_date = (payload.get("fromDate") or "").strip()
    to_date = (payload.get("toDate") or "").strip()
    custom_columns = get_custom_field_column_names()
    rows = fetch_report_rows(from_date, to_date, custom_columns)
    rows = apply_report_filters(rows, payload)
    columns = selected_report_columns(payload.get("columnKeys"), custom_columns)
    alignment = str(payload.get("alignment") or "left").strip().lower()
    summary = report_summary(rows)
    settings_row = latest_email_settings()

    if settings_row is None or not settings_row.sender_email or not settings_row.password or not settings_row.test_recipient:
        return jsonify({"message": "Configure email settings before sending report"}), 400

    if not rows:
        return jsonify({"message": "No report rows found for selected time frame"}), 400

    try:
        send_report_email(settings_row, rows, columns, summary, from_date, to_date, alignment)
        add_report_email_log(
            f"Report email sent to {settings_row.test_recipient} ({summary['totalRecords']} records)"
        )
    except (OSError, smtplib.SMTPException, TimeoutError) as exc:
        error_message = str(exc).strip() or "Failed to send report email"
        try:
            add_report_email_log(f"Report email error: {error_message}")
        except Exception:
            db.session.rollback()
        return jsonify({"message": error_message}), 500

    return jsonify({
        "message": "Report email sent successfully",
        "summary": {
            "totalRecords": summary["totalRecords"],
            "netWeight": summary["netWeight"],
            "totalAmount": summary["totalAmount"],
        },
    })
