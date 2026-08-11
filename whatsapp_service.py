import re
import threading
from datetime import datetime

from admin_config import (
    DEFAULT_WHATSAPP_TEMPLATE,
    get_whatsapp_enabled,
    get_whatsapp_send_on_save,
    get_whatsapp_template,
)

LAST_WHATSAPP_STATUS = {
    "ok": None,
    "message": "No WhatsApp message sent yet",
    "updatedAt": "",
}


WEIGHMENT_MESSAGE_FIELDS = {
    "serialNo": "serialNo",
    "refNo": "refNo",
    "entryDate": "entryDate",
    "entryTime": "entryTime",
    "vehicleNo": "vehicleNo",
    "vehicleType": "vehicleType",
    "weighingType": "weighingType",
    "material": "material",
    "customer": "customer",
    "mobileNo": "mobileNo",
    "paymentMode": "paymentMode",
    "charges": "charges",
    "grossWeight": "grossWeight",
    "grossDate": "grossDate",
    "grossTime": "grossTime",
    "tareWeight": "tareWeight",
    "tareDate": "tareDate",
    "tareTime": "tareTime",
    "netWeight": "netWeight",
}


def set_last_whatsapp_status(ok, message):
    LAST_WHATSAPP_STATUS.update({
        "ok": ok,
        "message": str(message or ""),
        "updatedAt": datetime.now().strftime("%Y-%m-%d %I:%M:%S %p"),
    })


def get_last_whatsapp_status():
    return dict(LAST_WHATSAPP_STATUS)


def normalize_mobile_for_whatsapp(value):
    digits = re.sub(r"\D", "", str(value or ""))
    if not digits:
        return ""
    if len(digits) == 10:
        digits = f"91{digits}"
    if len(digits) < 11:
        return ""
    return f"+{digits}"


def format_message_value(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def build_whatsapp_message(entry, template=None):
    source = entry or {}
    values = {
        placeholder: format_message_value(source.get(field_name))
        for placeholder, field_name in WEIGHMENT_MESSAGE_FIELDS.items()
    }
    message_template = template or get_whatsapp_template()
    try:
        return message_template.format(**values)
    except Exception:
        return DEFAULT_WHATSAPP_TEMPLATE.format(**values)


def _send_whatsapp_message(phone_number, message):
    import pywhatkit

    pywhatkit.sendwhatmsg_instantly(
        phone_number,
        message,
        wait_time=7,
        tab_close=True,
        close_time=1,
    )


def _send_whatsapp_message_tracked(phone_number, message):
    try:
        set_last_whatsapp_status(None, f"Opening WhatsApp Web for {phone_number}")
        _send_whatsapp_message(phone_number, message)
        set_last_whatsapp_status(True, f"WhatsApp message sent to {phone_number}")
    except Exception as exc:
        set_last_whatsapp_status(False, str(exc) or "WhatsApp sending failed")


def queue_whatsapp_text(phone_number, message):
    normalized_phone = normalize_mobile_for_whatsapp(phone_number)
    if not normalized_phone:
        return {"queued": False, "message": "Enter a valid WhatsApp mobile number"}

    clean_message = str(message or "").strip()
    if not clean_message:
        return {"queued": False, "message": "WhatsApp message is empty"}

    try:
        import pywhatkit  # noqa: F401
    except Exception as exc:
        return {
            "queued": False,
            "message": f"pywhatkit is not installed or cannot load: {exc}",
        }

    thread = threading.Thread(
        target=_send_whatsapp_message_tracked,
        args=(normalized_phone, clean_message),
        daemon=True,
    )
    thread.start()
    set_last_whatsapp_status(None, f"WhatsApp message queued to {normalized_phone}")
    return {"queued": True, "message": f"WhatsApp message queued to {normalized_phone}"}


def queue_whatsapp_message(entry, *, manual=False):
    if not manual:
        if not get_whatsapp_send_on_save():
            return {"queued": False, "message": "WhatsApp auto-send disabled"}
    if not get_whatsapp_enabled():
        return {"queued": False, "message": "WhatsApp disabled"}

    phone_number = normalize_mobile_for_whatsapp(
        (entry or {}).get("mobileNo") or (entry or {}).get("mobileNo1") or (entry or {}).get("mobileNo2")
    )
    if not phone_number:
        return {"queued": False, "message": "Mobile number not available"}

    message = build_whatsapp_message(entry)
    return queue_whatsapp_text(phone_number, message)
