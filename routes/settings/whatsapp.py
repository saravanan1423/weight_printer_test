from flask import jsonify, render_template, request

from . import settings_bp
from admin_config import (
    WHATSAPP_ENABLED_KEY,
    WHATSAPP_SEND_ON_SAVE_KEY,
    WHATSAPP_TEMPLATE_KEY,
    ensure_admin_settings_schema,
    get_whatsapp_enabled,
    get_whatsapp_send_on_save,
    get_whatsapp_template,
    set_admin_setting_bool,
    set_admin_setting_value,
)
from whatsapp_service import (
    build_whatsapp_message,
    get_last_whatsapp_status,
    queue_whatsapp_text,
)


@settings_bp.route("/whatsapp")
def whatsapp():
    ensure_admin_settings_schema()
    return render_template("whatsapp_settings.html")


@settings_bp.route("/api/whatsapp", methods=["GET"])
def whatsapp_details():
    ensure_admin_settings_schema()
    return jsonify({
        "settings": {
            "whatsappEnabled": get_whatsapp_enabled(),
            "whatsappSendOnSave": get_whatsapp_send_on_save(),
            "whatsappTemplate": get_whatsapp_template(),
            "lastStatus": get_last_whatsapp_status(),
        }
    })


@settings_bp.route("/api/whatsapp", methods=["POST"])
def whatsapp_save():
    ensure_admin_settings_schema()
    payload = request.get_json(silent=True) or {}
    whatsapp_enabled = bool(payload.get("whatsappEnabled"))
    whatsapp_send_on_save = bool(payload.get("whatsappSendOnSave"))
    whatsapp_template = str(payload.get("whatsappTemplate") or "").strip()

    if not whatsapp_template:
        return jsonify({"message": "WhatsApp message structure is required"}), 400

    set_admin_setting_bool(WHATSAPP_ENABLED_KEY, whatsapp_enabled)
    set_admin_setting_bool(WHATSAPP_SEND_ON_SAVE_KEY, whatsapp_send_on_save)
    set_admin_setting_value(WHATSAPP_TEMPLATE_KEY, whatsapp_template)

    return jsonify({
        "message": "WhatsApp settings saved",
        "settings": {
            "whatsappEnabled": whatsapp_enabled,
            "whatsappSendOnSave": whatsapp_send_on_save,
            "whatsappTemplate": get_whatsapp_template(),
            "lastStatus": get_last_whatsapp_status(),
        },
    })


@settings_bp.route("/api/whatsapp/test", methods=["POST"])
def whatsapp_test():
    ensure_admin_settings_schema()
    payload = request.get_json(silent=True) or {}
    mobile_number = str(payload.get("testMobileNo") or "").strip()
    template = str(payload.get("whatsappTemplate") or get_whatsapp_template() or "").strip()

    if not mobile_number:
        return jsonify({"message": "Test mobile number is required"}), 400
    if not template:
        return jsonify({"message": "WhatsApp message structure is required"}), 400

    sample_entry = {
        "serialNo": "TEST",
        "refNo": "TEST",
        "entryDate": "24-07-2026",
        "entryTime": "10:00 PM",
        "vehicleNo": "TEST1234",
        "vehicleType": "Test Vehicle",
        "weighingType": "Full",
        "material": "Test Material",
        "customer": "Test Customer",
        "mobileNo": mobile_number,
        "paymentMode": "Cash",
        "charges": "0",
        "grossWeight": "1000",
        "grossDate": "24-07-2026",
        "grossTime": "10:00 PM",
        "tareWeight": "500",
        "tareDate": "24-07-2026",
        "tareTime": "10:05 PM",
        "netWeight": "500",
    }
    message = build_whatsapp_message(sample_entry, template=template)
    whatsapp_status = queue_whatsapp_text(mobile_number, message)
    if not whatsapp_status.get("queued"):
        return jsonify({
            "message": whatsapp_status.get("message") or "WhatsApp test failed",
            "lastStatus": get_last_whatsapp_status(),
        }), 400

    return jsonify({
        "message": whatsapp_status.get("message") or "WhatsApp test queued",
        "lastStatus": get_last_whatsapp_status(),
    })


@settings_bp.route("/api/whatsapp/status", methods=["GET"])
def whatsapp_status():
    return jsonify({"lastStatus": get_last_whatsapp_status()})
