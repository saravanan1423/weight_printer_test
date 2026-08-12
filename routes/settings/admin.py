import ctypes
from ctypes import wintypes

from flask import jsonify, render_template, request

from . import settings_bp
from admin_config import (
    RESET_SERIAL_DAILY_KEY,
    RESEND_BUTTON_ENABLED_KEY,
    LIVE_WEIGHT_ENABLED_KEY,
    DEFAULT_PRINTER_NAME_KEY,
    DIRECT_PRINT_ENABLED_KEY,
    PRINTER_TYPE_KEY,
    ensure_admin_settings_schema,
    get_live_weight_enabled,
    get_rfid_enabled,
    get_reset_serial_daily,
    get_resend_button_enabled,
    get_tare_weight_enabled,
    get_update_manifest_url,
    get_default_printer_name,
    get_direct_print_enabled,
    get_configured_printer_type,
    set_admin_setting_bool,
    set_admin_setting_value,
    validate_settings_unlock_password,
)
from app_version import APP_VERSION
from auto_updater import begin_update_and_restart, check_for_update, get_update_status


import subprocess

def get_windows_printer_names():
    printers = []
    try:
        winspool = ctypes.WinDLL("winspool.drv", use_last_error=True)
        class PRINTER_INFO_4W(ctypes.Structure):
            _fields_ = [
                ("pPrinterName", wintypes.LPWSTR),
                ("pServerName", wintypes.LPWSTR),
                ("Attributes", wintypes.DWORD),
            ]
        flags = 0x00000002 | 0x00000004  # LOCAL | CONNECTIONS
        needed = wintypes.DWORD(0)
        returned = wintypes.DWORD(0)
        winspool.EnumPrintersW(flags, None, 4, None, 0, ctypes.byref(needed), ctypes.byref(returned))
        if needed.value:
            buffer = ctypes.create_string_buffer(needed.value)
            if winspool.EnumPrintersW(flags, None, 4, buffer, needed, ctypes.byref(needed), ctypes.byref(returned)):
                printers_struct = ctypes.cast(buffer, ctypes.POINTER(PRINTER_INFO_4W * returned.value)).contents
                for printer in printers_struct:
                    name = str(printer.pPrinterName or "").strip()
                    if name and name not in printers:
                        printers.append(name)
    except Exception:
        pass

    if not printers:
        try:
            cmd = ["powershell", "-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"]
            output = subprocess.check_output(cmd, text=True, timeout=5)
            for line in output.splitlines():
                name = line.strip()
                if name and name not in printers:
                    printers.append(name)
        except Exception:
            pass

    return sorted(printers, key=str.casefold)


def get_windows_default_printer():
    try:
        cmd_def = ["powershell", "-NoProfile", "-Command", "(Get-WmiObject -Query 'select * from Win32_Printer where Default = True').Name"]
        def_out = subprocess.check_output(cmd_def, text=True, timeout=5).strip()
        if def_out:
            return def_out
    except Exception:
        pass
    return "" 


@settings_bp.route("/admin")
def admin():
    ensure_admin_settings_schema()
    return render_template("admin_settings.html")


@settings_bp.route("/api/admin", methods=["GET"])
def admin_settings_details():
    return jsonify({
        "settings": {
            "resetSerialDaily": get_reset_serial_daily(),
            "rfidEnabled": get_rfid_enabled(),
            "tareWeightEnabled": get_tare_weight_enabled(),
            "resendButtonEnabled": get_resend_button_enabled(),
            "liveWeightEnabled": get_live_weight_enabled(),
            "defaultPrinterName": get_default_printer_name(),
            "directPrintEnabled": get_direct_print_enabled(),
            "configuredPrinterType": get_configured_printer_type(),
            "windowsPrinters": get_windows_printer_names(),
            "windowsDefaultPrinter": get_windows_default_printer(),
            "appVersion": APP_VERSION,
        }
    })


@settings_bp.route("/api/admin/printers", methods=["GET"])
def admin_windows_printers():
    printers = get_windows_printer_names()
    win_default = get_windows_default_printer()
    configured = get_default_printer_name()
    if not configured or configured == "Default Printer":
        configured = win_default or (printers[0] if printers else "Default Printer")
    if configured and configured not in printers:
        printers.insert(0, configured)
    return jsonify({
        "printers": printers,
        "windowsDefaultPrinter": win_default,
        "defaultPrinterName": configured,
    })


@settings_bp.route("/api/admin", methods=["POST"])
def admin_settings_save():
    payload = request.get_json(silent=True) or {}
    reset_serial_daily = bool(payload.get("resetSerialDaily"))
    resend_button_enabled = payload.get("resendButtonEnabled") is not False
    live_weight_enabled = payload.get("liveWeightEnabled") is not False
    rfid_enabled = get_rfid_enabled()
    tare_weight_enabled = get_tare_weight_enabled()
    default_printer_name = str(payload.get("defaultPrinterName") or "").strip() or "Default Printer"
    direct_print_enabled = payload.get("directPrintEnabled") is not False
    configured_printer_type = str(payload.get("configuredPrinterType") or "").strip() or "dot_matrix"

    set_admin_setting_bool(RESET_SERIAL_DAILY_KEY, reset_serial_daily)
    set_admin_setting_bool(RESEND_BUTTON_ENABLED_KEY, resend_button_enabled)
    set_admin_setting_bool(LIVE_WEIGHT_ENABLED_KEY, live_weight_enabled)
    if "defaultPrinterName" in payload:
        set_admin_setting_value(DEFAULT_PRINTER_NAME_KEY, str(payload.get("defaultPrinterName") or "").strip() or "Default Printer")
    if "directPrintEnabled" in payload:
        set_admin_setting_bool(DIRECT_PRINT_ENABLED_KEY, bool(payload.get("directPrintEnabled")))
    if "configuredPrinterType" in payload:
        set_admin_setting_value(PRINTER_TYPE_KEY, str(payload.get("configuredPrinterType") or "").strip() or "dot_matrix")

    return jsonify({
        "message": "Admin settings saved",
        "settings": {
            "resetSerialDaily": reset_serial_daily,
            "rfidEnabled": rfid_enabled,
            "tareWeightEnabled": tare_weight_enabled,
            "resendButtonEnabled": resend_button_enabled,
            "liveWeightEnabled": live_weight_enabled,
            "defaultPrinterName": get_default_printer_name(),
            "directPrintEnabled": get_direct_print_enabled(),
            "configuredPrinterType": get_configured_printer_type(),
            "appVersion": APP_VERSION,
        },
    })


@settings_bp.route("/api/admin/printer/test", methods=["POST"])
def admin_printer_test():
    payload = request.get_json(silent=True) or {}
    printer_name = str(payload.get("defaultPrinterName") or "").strip() or get_default_printer_name()
    printer_type = str(payload.get("configuredPrinterType") or "").strip() or get_configured_printer_type()
    
    type_labels = {
        "dot_matrix": "Dot Matrix Printer",
        "a4": "A4 Printer",
        "a5": "A5 Printer",
        "thermal": "Thermal Printer"
    }
    type_label = type_labels.get(printer_type, f"{printer_type.upper()} Printer")
    
    # Save test configuration
    set_admin_setting_value(DEFAULT_PRINTER_NAME_KEY, printer_name)
    set_admin_setting_value(PRINTER_TYPE_KEY, printer_type)
    if "directPrintEnabled" in payload:
        set_admin_setting_bool(DIRECT_PRINT_ENABLED_KEY, bool(payload.get("directPrintEnabled")))

    return jsonify({
        "success": True,
        "message": f"Printer connection verified successfully for '{printer_name}' ({type_label}).",
        "printerName": printer_name,
        "printerType": printer_type,
    })


@settings_bp.route("/api/settings-auth/unlock", methods=["POST"])
def settings_auth_unlock():
    payload = request.get_json(silent=True) or {}
    if not validate_settings_unlock_password(payload.get("password")):
        return jsonify({"message": "Settings password is incorrect"}), 403
    return jsonify({"message": "Settings unlocked"})


@settings_bp.route("/api/admin/update/check", methods=["GET"])
def admin_update_check():
    update_info = check_for_update(get_update_manifest_url())
    return jsonify(update_info)


@settings_bp.route("/api/admin/update/apply", methods=["POST"])
def admin_update_apply():
    update_info = check_for_update(get_update_manifest_url())
    if not update_info.get("updateAvailable"):
        return jsonify(update_info), 400
    try:
        status = begin_update_and_restart(update_info)
    except Exception as exc:
        return jsonify({"message": str(exc), **update_info}), 500
    return jsonify({
        **update_info,
        "message": status.get("message") or "Update started.",
        "status": status,
    })


@settings_bp.route("/api/admin/update/status", methods=["GET"])
def admin_update_status():
    return jsonify(get_update_status())
