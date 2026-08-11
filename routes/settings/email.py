import smtplib
import ssl
from email.message import EmailMessage

from flask import jsonify, render_template, request
from sqlalchemy import inspect
from sqlalchemy.exc import SQLAlchemyError

from models.models import Email_error_log, Email_settings, db
from . import settings_bp


EMAIL_SETTINGS_TABLE = "email_settings"
EMAIL_LOG_TABLE = "email_error_log"
DEFAULT_SMTP_HOST = "smtp.gmail.com"
DEFAULT_SMTP_PORT = 587
DEFAULT_SECURITY = "TLS"
EMAIL_SUCCESS_LOG = "Email connection saved"
EMAIL_TEST_SUCCESS_LOG = "Email instruction sent"
INFO_LOG_PREFIXES = (
    EMAIL_SUCCESS_LOG,
    EMAIL_TEST_SUCCESS_LOG,
)


@settings_bp.route("/email")
def email():
    ensure_email_schema()
    return render_template("email_settings.html")


def ensure_email_schema():
    inspector = inspect(db.engine)
    table_names = set(inspector.get_table_names())

    if EMAIL_SETTINGS_TABLE not in table_names:
        Email_settings.__table__.create(db.engine)

    inspector = inspect(db.engine)
    table_names = set(inspector.get_table_names())
    if EMAIL_LOG_TABLE not in table_names:
        Email_error_log.__table__.create(db.engine)


def normalize_log_message(message):
    return " ".join(str(message or "").split()).strip()


def is_error_message(message):
    normalized = normalize_log_message(message)
    return bool(normalized) and not any(
        normalized.startswith(prefix) for prefix in INFO_LOG_PREFIXES
    )


def add_email_log(message, *, dedupe=False):
    normalized = normalize_log_message(message)
    if not normalized:
        return

    if dedupe:
        last_log = Email_error_log.query.order_by(
            Email_error_log.timestamp.desc(),
            Email_error_log.id.desc(),
        ).first()
        if last_log and normalize_log_message(last_log.error_log) == normalized:
            return

    db.session.add(Email_error_log(error_log=normalized[:255]))
    db.session.commit()


def serialize_settings(row):
    if row is None:
        return {
            "smtpHost": DEFAULT_SMTP_HOST,
            "smtpPort": str(DEFAULT_SMTP_PORT),
            "security": DEFAULT_SECURITY,
            "senderEmail": "",
            "username": "",
            "password": "",
            "recipient": "",
            "testRecipient": "",
            "isConnected": False,
        }

    return {
        "smtpHost": row.smtp_host,
        "smtpPort": str(row.smtp_port),
        "security": row.security,
        "senderEmail": row.sender_email,
        "username": row.username,
        "password": row.password,
        "recipient": row.test_recipient,
        "testRecipient": row.test_recipient,
        "isConnected": bool(row.is_connected),
    }


def get_latest_email_settings():
    return Email_settings.query.order_by(
        Email_settings.updated_at.desc(),
        Email_settings.id.desc(),
    ).first()


def validate_email_settings(payload):
    smtp_host = DEFAULT_SMTP_HOST
    security = DEFAULT_SECURITY
    sender_email = (payload.get("senderEmail") or "").strip()
    username = (payload.get("username") or sender_email).strip()
    password = (payload.get("password") or "").strip()
    recipient = (payload.get("recipient") or payload.get("testRecipient") or "").strip()

    smtp_port = DEFAULT_SMTP_PORT

    if not sender_email or "@" not in sender_email:
        return None, "Sender email is required"
    if not password:
        return None, "Password is required"
    if not recipient or "@" not in recipient:
        return None, "Recipient email is required"

    return {
        "smtp_host": smtp_host,
        "smtp_port": smtp_port,
        "security": security,
        "sender_email": sender_email,
        "username": username,
        "password": password,
        "test_recipient": recipient,
    }, None


def build_instruction_email(settings_data):
    message = EmailMessage()
    message["Subject"] = "Weighman WMS email configuration instructions"
    message["From"] = settings_data["sender_email"]
    message["To"] = settings_data["test_recipient"]
    message.set_content(
        "\n".join([
            "Weighman WMS email configuration instructions",
            "",
            "Create a Gmail app password:",
            "1. Sign in to the Google account used as the sender email.",
            "2. Open Google Account > Security.",
            "3. Turn on 2-Step Verification if it is not already enabled.",
            "4. Open App passwords from the Security page.",
            "5. Create a new app password for Mail. Use Weighman WMS as the app/device name if Google asks for a name.",
            "6. Copy the generated 16-character app password.",
            "7. Paste that app password into Password / App Password in Weighman WMS.",
            "",
            "Configure Weighman WMS:",
            "1. Open Settings > Email Setting.",
            "2. Enter the Sender Email address.",
            "3. Enter the Username. For Gmail, this is usually the full sender email address.",
            "4. Enter the app password in Password / App Password.",
            "5. Enter the Recipient email address.",
            "6. Click Save Connection to store the settings.",
            "7. Click Send Instruction Email to verify the SMTP connection and delivery.",
            "",
            "If the test fails, check the Email Error Log on the same page for the latest error.",
            "",
            "Current saved configuration:",
            f"Sender Email: {settings_data['sender_email']}",
            f"Username: {settings_data['username']}",
            f"Recipient: {settings_data['test_recipient']}",
        ])
    )
    return message


def send_instruction_email(settings_data):
    message = build_instruction_email(settings_data)
    context = ssl.create_default_context()

    with smtplib.SMTP(DEFAULT_SMTP_HOST, DEFAULT_SMTP_PORT, timeout=12) as server:
        server.starttls(context=context)
        server.login(settings_data["username"] or settings_data["sender_email"], settings_data["password"])
        server.sendmail(
            settings_data["sender_email"],
            settings_data["test_recipient"],
            message.as_string(),
        )


@settings_bp.route("/api/email", methods=["GET"])
def email_details():
    ensure_email_schema()
    settings_row = get_latest_email_settings()
    logs = Email_error_log.query.order_by(
        Email_error_log.timestamp.desc(),
        Email_error_log.id.desc(),
    ).limit(100).all()

    return jsonify({
        "settings": serialize_settings(settings_row),
        "logs": [
            {
                "id": log.id,
                "message": log.error_log,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                "type": "error" if is_error_message(log.error_log) else "info",
            }
            for log in logs
        ],
    })


@settings_bp.route("/api/email", methods=["POST"])
def email_save():
    ensure_email_schema()
    payload = request.get_json(silent=True) or {}
    settings_data, validation_message = validate_email_settings(payload)

    if validation_message:
        return jsonify({"message": validation_message}), 400

    row = get_latest_email_settings()
    if row is None:
        row = Email_settings(**settings_data, is_connected=True)
        db.session.add(row)
    else:
        row.smtp_host = settings_data["smtp_host"]
        row.smtp_port = settings_data["smtp_port"]
        row.security = settings_data["security"]
        row.sender_email = settings_data["sender_email"]
        row.username = settings_data["username"]
        row.password = settings_data["password"]
        row.test_recipient = settings_data["test_recipient"]
        row.is_connected = True

    try:
        db.session.commit()
        add_email_log(
            f"{EMAIL_SUCCESS_LOG} ({row.smtp_host}, {row.smtp_port}, {row.security}, {row.sender_email})"
        )
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"message": "Failed to save email settings"}), 500

    return jsonify({
        "message": "Email connection saved successfully",
        "settings": serialize_settings(row),
    })


@settings_bp.route("/api/email/test", methods=["POST"])
def email_test():
    ensure_email_schema()
    payload = request.get_json(silent=True) or {}
    settings_data, validation_message = validate_email_settings(payload)

    if validation_message:
        return jsonify({"message": validation_message}), 400

    row = get_latest_email_settings()

    try:
        send_instruction_email(settings_data)
        if row is None:
            row = Email_settings(**settings_data, is_connected=True)
            db.session.add(row)
        else:
            row.smtp_host = settings_data["smtp_host"]
            row.smtp_port = settings_data["smtp_port"]
            row.security = settings_data["security"]
            row.sender_email = settings_data["sender_email"]
            row.username = settings_data["username"]
            row.password = settings_data["password"]
            row.test_recipient = settings_data["test_recipient"]
            row.is_connected = True
        db.session.commit()
        add_email_log(f"{EMAIL_TEST_SUCCESS_LOG} to {settings_data['test_recipient']}")
    except (OSError, smtplib.SMTPException, TimeoutError) as exc:
        error_message = str(exc).strip() or "Email connection failed"
        try:
            if row is not None:
                row.is_connected = False
                db.session.commit()
            add_email_log(f"Email connection error: {error_message}", dedupe=True)
        except SQLAlchemyError:
            db.session.rollback()
        return jsonify({
            "message": error_message,
            "status": "not_connected",
            "settings": serialize_settings(row),
        }), 500
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"message": "Failed to update email connection"}), 500

    return jsonify({
        "message": "Instruction email sent successfully",
        "status": "success",
        "settings": serialize_settings(row),
    })
