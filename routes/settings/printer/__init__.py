import json
from flask import abort, current_app, jsonify, render_template, request
from werkzeug.utils import secure_filename

from routes.weightment.weightment import (
    fetch_weighment_by_id,
    get_custom_field_column_names,
    serialize_weighment_row,
)
from .. import settings_bp

from .common import (
    LEGACY_A4_DEFAULT_TEMPLATE_NAME,
    LEGACY_A5_DEFAULT_TEMPLATE_NAME,
    PRINTER_LAYOUT_NAME,
    A5_EMPTY_TEMPLATE_NAME,
    DOT_MATRIX_EMPTY_TEMPLATE_NAME,
    PRINTER_LAYOUT_SETTINGS_NAME,
    MAX_PRINTER_LAYOUT_NAME_LENGTH,
    DEFAULT_PRINTER_TYPE,
    PRINTER_LAYOUT_VERSION,
    DOT_MATRIX_RAW_GRID_SIZE,
    DOT_MATRIX_RAW_MAX_LINES,
    DOT_MATRIX_OPTIONAL_STRUCTURAL_BLOCKS,
    PRINTER_TYPE_OPTIONS,
    PRINTER_TYPE_CONFIG,
    PRINTER_TYPE_ORDER,
    PRINTER_TYPE_DEFAULT_TEMPLATE_NAMES,
    HEX_COLOR_DEFAULTS,
    ALLOWED_IMAGE_EXTENSIONS,
    MAX_IMAGE_UPLOAD_BYTES,
    MAX_LAYOUT_ELEMENTS,
    MIN_PAGE_WIDTH_MM,
    MAX_PAGE_WIDTH_MM,
    MIN_PAGE_HEIGHT_MM,
    MAX_PAGE_HEIGHT_MM,
    MAX_FIELD_ROWS,
    MAX_FIELDS_PER_ROW,
    FIELD_ROWS_SECTION_DEFAULTS,
    LEGACY_MANAGED_FIELD_IDS,
    BASE_PRINTER_FIELD_OPTIONS,
    PHOTO_SOURCE_OPTIONS,
    FONT_WEIGHT_OPTIONS,
    FONT_FAMILY_OPTIONS,
    DEFAULT_DOT_MATRIX_FONT_FAMILY,
    ALIGN_OPTIONS,
    FIT_OPTIONS,
    ELEMENT_KIND_OPTIONS,
    BASE_TEMPLATE_REMOVABLE_FIELD_SOURCES,
    BASE_TEMPLATE_EDITABLE_ELEMENT_PROPERTIES,
    format_field_label,
    clone_layout,
    normalize_printer_type,
    normalize_layout_name,
    printer_type_config,
    printer_type_limits,
    printer_type_label,
    default_template_name_for_printer_type,
    base_template_requires_restricted_editing,
    infer_printer_type,
    serialize_printer_types,
    printer_field_options,
    default_thermal_info_rows,
    default_thermal_weight_rows,
    default_thermal_receipt_rows,
    default_thermal_printer_layout,
    legacy_field_rows_from_elements,
    normalize_text,
    normalize_float,
    normalize_int,
    normalize_color,
    normalize_optional_color,
    normalize_alignment,
    normalize_fit,
    normalize_font_family,
    normalize_page_orientation,
    normalize_font_weight,
    normalize_kind,
    normalize_field_row_field,
    normalize_field_rows,
    normalize_managed_section,
    normalize_managed_sections,
    default_element_for_kind,
    normalize_element,
    normalize_printer_layout,
    validate_base_template_rows,
    validate_base_template_sections,
    validate_base_template_elements,
    validate_base_template_update,
    layout_matches_signature,
    is_legacy_default_layout,
    layout_has_element,
    layout_element_has_meta_sources,
    layout_weight_element_matches,
    layout_page_matches,
    layout_version_is_outdated,
    default_layout_requires_content_refresh,
    find_logo_image_url_in_layout,
    resolve_preferred_a4_logo_image_url,
    build_editable_printer_template_layout,
    list_printer_template_rows,
    unique_printer_layout_name,
    find_printer_template_row,
    printer_template_row_printer_type,
    is_base_printer_template_name,
    is_protected_printer_template_name,
    ensure_printer_default_template,
    get_printer_layout_settings_row,
    load_printer_layout_json,
    normalize_saved_printer_layout,
    get_active_printer_layout_name,
    set_active_printer_layout_name,
    resolve_printer_layout_name,
    get_saved_printer_layout_bundle,
    get_saved_printer_layout,
    get_active_printer_type,
    number_to_words_inr,
    fallback_printer_template_name,
    serialize_printer_templates,
    build_printer_layout_response,
    save_printer_layout,
    create_printer_layout_template,
    delete_printer_layout_template,
    build_sample_printer_entry,
    allowed_image_file,
    save_printer_asset,
)

from .a4 import (
    default_field_rows,
    default_printer_elements,
    default_a4_printer_layout,
    second_default_a4_printer_layout,
    is_outdated_second_default_a4_layout,
)
from .a5 import (
    default_a5_field_rows,
    default_a5_printer_layout,
    empty_a5_printer_layout,
    is_outdated_empty_a5_template_layout,
)
from .dot_matrix import (
    default_dot_matrix_field_rows,
    default_dot_matrix_weight_rows,
    default_dot_matrix_printer_layout,
    empty_dot_matrix_printer_layout,
    expand_dot_matrix_full_width_elements,
    expand_dot_matrix_full_width_sections,
    is_outdated_empty_dot_matrix_template_layout,
    generate_dot_matrix_raw_lines,
    escp_font_select_command,
    spool_raw_data_to_printer,
    get_available_windows_printers,
)


def default_printer_layout(printer_type=DEFAULT_PRINTER_TYPE):
    normalized_type = normalize_printer_type(printer_type)
    if normalized_type == "a5":
        return default_a5_printer_layout()
    if normalized_type == "thermal":
        return default_thermal_printer_layout()
    if normalized_type == "dot_matrix":
        return default_dot_matrix_printer_layout()
    return default_a4_printer_layout()


def is_outdated_default_layout_for_printer_type(layout, printer_type):
    resolved_type = normalize_printer_type(printer_type)
    if not isinstance(layout, dict):
        return True

    if resolved_type == "thermal":
        return (
            not layout_has_element(layout, "thermal-company-name")
            or not layout_has_element(layout, "thermal-weight-heading")
            or not layout_has_element(layout, "thermal-thanks")
            or len((layout.get("managedSections") or [])) != 1
            or not layout_page_matches(layout, expected_width=80.0, expected_height=80.0)
        )

    if resolved_type == "dot_matrix":
        return (
            layout.get("templateKind") != "blank_canvas"
            or layout_has_element(layout, "dot-company-name")
            or layout_has_element(layout, "dot-company-subtitle")
            or layout_has_element(layout, "dot-divider-top")
            or layout_has_element(layout, "dot-operator-sign")
            or layout_has_element(layout, "dot-footer-note")
        )

    if resolved_type == "a5":
        return (
            not layout_has_element(layout, "a5-company-name")
            or not layout_has_element(layout, "a5-weight-heading")
            or not layout_has_element(layout, "a5-footer-note")
            or not (
                layout_page_matches(layout, expected_width=210.0, expected_height=148.0)
                or layout_page_matches(layout, expected_width=148.0, expected_height=210.0)
            )
        )

    return False


EDITABLE_PRINTER_TEMPLATE_DEFINITIONS = (
    {
        "layoutName": "A4 Default 2",
        "printerType": "a4",
        "builder": second_default_a4_printer_layout,
    },
    {
        "layoutName": A5_EMPTY_TEMPLATE_NAME,
        "printerType": "a5",
        "builder": empty_a5_printer_layout,
    },
    {
        "layoutName": DOT_MATRIX_EMPTY_TEMPLATE_NAME,
        "printerType": "dot_matrix",
        "builder": empty_dot_matrix_printer_layout,
    },
)


@settings_bp.route("/api/printer/windows-printers", methods=["GET"])
def get_windows_printers_route():
    from admin_config import get_default_printer_name
    printers = get_available_windows_printers()
    default_name = get_default_printer_name()
    return jsonify({
        "printers": printers,
        "defaultPrinter": default_name,
    })


@settings_bp.route("/api/printer/default-windows-printer", methods=["POST"])
def set_default_windows_printer():
    from admin_config import set_admin_setting_value, DEFAULT_PRINTER_NAME_KEY
    payload = request.get_json(silent=True) or {}
    printer_name = str(payload.get("printerName") or "").strip()
    if printer_name:
        set_admin_setting_value(DEFAULT_PRINTER_NAME_KEY, printer_name)
    return jsonify({"success": True, "printerName": printer_name})


@settings_bp.route("/api/printer/preview-raw-lines", methods=["POST"])
def preview_raw_lines():
    data = request.get_json(silent=True) or {}
    entry = data.get("entry")
    layout_name = data.get("layoutName")
    feed_mode = data.get("feedMode", "auto_40")
    extra_lines = int(data.get("extraLines", 2))
    line_width = int(data.get("lineWidth", 80))
    total_lines = int(data.get("totalLines", DOT_MATRIX_RAW_GRID_SIZE))

    custom_columns = get_custom_field_column_names()
    live_layout = data.get("layout")
    if isinstance(live_layout, dict):
        layout = normalize_printer_layout(live_layout, custom_columns, "dot_matrix")
    else:
        layout = get_saved_printer_layout(custom_columns, layout_name)

    content_count, lines, line_blocks = generate_dot_matrix_raw_lines(entry, layout, line_width, feed_mode, extra_lines, total_lines)

    numbered_lines = []
    for i, line in enumerate(lines, 1):
        tag = f"[{i:02d}]"
        if i <= content_count:
            numbered_lines.append(f"{tag} {line}")
        else:
            numbered_lines.append(f"{tag} (blank line feed)")

    return jsonify({
        "success": True,
        "contentLines": content_count,
        "blankLines": len(lines) - content_count,
        "totalLines": len(lines),
        "lines": lines,
        "lineBlocks": line_blocks,
        "numberedLines": numbered_lines,
        "previewText": "\n".join(numbered_lines),
    })


@settings_bp.route("/api/printer/direct-raw-print", methods=["POST"])
def direct_raw_print():
    data = request.get_json(silent=True) or {}
    entry_id = data.get("entryId")
    entry_data = data.get("entry")
    layout_name = data.get("layoutName")
    printer_name = data.get("printerName")
    feed_mode = data.get("feedMode", "auto_40")
    extra_lines = int(data.get("extraLines", 2))
    line_width = int(data.get("lineWidth", 80))
    total_lines = int(data.get("totalLines", DOT_MATRIX_RAW_GRID_SIZE))
    send_escp_init = bool(data.get("sendEscpInit", True))
    send_form_feed = bool(data.get("sendFormFeed", False))

    if not printer_name:
        from admin_config import get_default_printer_name
        printer_name = get_default_printer_name()
    if not printer_name:
        return jsonify({"success": False, "message": "No Windows printer selected or configured"}), 400

    custom_columns = get_custom_field_column_names()
    live_layout = data.get("layout")
    if isinstance(live_layout, dict):
        layout = normalize_printer_layout(live_layout, custom_columns, "dot_matrix")
    else:
        layout = get_saved_printer_layout(custom_columns, layout_name)

    if not entry_data and entry_id:
        entry_row = fetch_weighment_by_id(entry_id)
        if entry_row is not None:
            entry_data = serialize_weighment_row(entry_row)

    content_count, lines, _line_blocks = generate_dot_matrix_raw_lines(entry_data, layout, line_width, feed_mode, extra_lines, total_lines)

    crlf_text = "\r\n".join(lines) + "\r\n"
    payload = bytearray()
    if send_escp_init:
        payload.extend(b"\x1B@")
        payload.extend(b"\x1BC\x00\x06")
        payload.extend(escp_font_select_command(layout))
    payload.extend(crlf_text.encode("ascii", errors="replace"))
    if send_form_feed:
        payload.extend(b"\x0C")

    ticket_no = (entry_data or {}).get("serialNo") or (entry_data or {}).get("ticketNo") or ""
    doc_title = f"Weighment Slip #{ticket_no}" if ticket_no else "Weighment Slip"
    res = spool_raw_data_to_printer(printer_name, payload, doc_title=doc_title)
    success = res[0]
    message = res[1]
    actual_printer = res[2] if len(res) > 2 else printer_name
    if not success:
        return jsonify({"success": False, "message": message, "printerName": actual_printer}), 500

    return jsonify({
        "success": True,
        "message": f"Printed {content_count} content lines ({len(lines)} total) to {actual_printer}",
        "printerName": actual_printer,
        "linesCount": len(lines),
        "contentLines": content_count,
    })


@settings_bp.route("/api/printer/advance-paper", methods=["POST"])
def advance_paper():
    data = request.get_json(silent=True) or {}
    printer_name = data.get("printerName")
    lines_to_advance = max(1, min(100, int(data.get("lines", 40))))

    if not printer_name:
        from admin_config import get_default_printer_name
        printer_name = get_default_printer_name()

    payload = b"\r\n" * lines_to_advance
    res = spool_raw_data_to_printer(printer_name, payload, doc_title="Advance Paper")
    ok = res[0]
    msg = res[1]
    actual_p = res[2] if len(res) > 2 else printer_name
    return jsonify({"success": ok, "message": msg, "printerName": actual_p})


@settings_bp.route("/printer")
def printer():
    custom_columns = get_custom_field_column_names()
    return render_template(
        "printer_settings.html",
        **build_printer_layout_response(custom_columns),
    )


@settings_bp.route("/api/printer-layout", methods=["GET"])
def printer_layout_get():
    custom_columns = get_custom_field_column_names()
    layout_name = request.args.get("name") or request.args.get("template")
    return jsonify(build_printer_layout_response(custom_columns, layout_name))


@settings_bp.route("/api/printer-layout", methods=["POST"])
def printer_layout_save():
    custom_columns = get_custom_field_column_names()
    payload = request.get_json(silent=True) or {}
    layout = payload.get("layout")
    layout_name = payload.get("layoutName")
    printer_type = payload.get("printerType")

    if not isinstance(layout, dict):
        return jsonify({"message": "Printer layout is required"}), 400

    try:
        saved_name, _ = save_printer_layout(
            layout,
            custom_columns,
            layout_name,
            printer_type,
        )
    except ValueError as error:
        return jsonify({"message": str(error)}), 400

    return jsonify(
        build_printer_layout_response(
            custom_columns,
            saved_name,
            message=f"Printer layout {saved_name} saved successfully",
        )
    )


@settings_bp.route("/api/printer-layout/active", methods=["POST"])
def printer_layout_set_active():
    custom_columns = get_custom_field_column_names()
    payload = request.get_json(silent=True) or {}
    layout_name = payload.get("layoutName")

    try:
        active_layout_name = set_active_printer_layout_name(layout_name, custom_columns)
    except ValueError as error:
        return jsonify({"message": str(error)}), 400

    return jsonify(
        build_printer_layout_response(
            custom_columns,
            active_layout_name,
            message=f"Using template {active_layout_name} for print",
        )
    )


@settings_bp.route("/api/printer-layout/templates", methods=["GET"])
def printer_layout_templates_get():
    custom_columns = get_custom_field_column_names()
    active_layout_name = get_active_printer_layout_name(custom_columns)
    _, active_layout = get_saved_printer_layout_bundle(custom_columns, active_layout_name)
    return jsonify({
        "templates": serialize_printer_templates(custom_columns, active_layout_name),
        "activeLayoutName": active_layout_name,
        "activePrinterType": active_layout.get("printerType", DEFAULT_PRINTER_TYPE),
        "printerTypes": serialize_printer_types(),
    })


@settings_bp.route("/api/printer-layout/templates", methods=["POST"])
def printer_layout_templates_create():
    custom_columns = get_custom_field_column_names()
    payload = request.get_json(silent=True) or {}
    layout = payload.get("layout")
    layout_name = payload.get("layoutName")
    printer_type = payload.get("printerType")
    source_layout_name = payload.get("sourceLayoutName")

    if not isinstance(layout, dict) and not normalize_layout_name(source_layout_name):
        return jsonify({"message": "Printer layout is required"}), 400

    try:
        created_layout_name, _ = create_printer_layout_template(
            layout_name,
            layout,
            custom_columns,
            printer_type,
            source_layout_name,
        )
        set_active_printer_layout_name(created_layout_name, custom_columns)
    except ValueError as error:
        return jsonify({"message": str(error)}), 400

    return jsonify(
        build_printer_layout_response(
            custom_columns,
            created_layout_name,
            message=f"Template {created_layout_name} created",
        )
    )


@settings_bp.route("/api/printer-layout/templates", methods=["DELETE"])
def printer_layout_templates_delete():
    custom_columns = get_custom_field_column_names()
    payload = request.get_json(silent=True) or {}
    layout_name = payload.get("layoutName")

    if not normalize_layout_name(layout_name):
        return jsonify({"message": "Template name is required"}), 400

    try:
        deleted_layout_name, next_layout_name = delete_printer_layout_template(
            layout_name,
            custom_columns,
        )
    except ValueError as error:
        return jsonify({"message": str(error)}), 400

    return jsonify(
        build_printer_layout_response(
            custom_columns,
            next_layout_name,
            message=f"Template {deleted_layout_name} deleted",
        )
    )


@settings_bp.route("/api/printer-layout/assets", methods=["POST"])
def printer_layout_asset_upload():
    try:
        image_url = save_printer_asset(request.files.get("image"))
    except ValueError as error:
        return jsonify({"message": str(error)}), 400

    return jsonify({
        "message": "Logo uploaded",
        "imageUrl": image_url,
    })


@settings_bp.route("/printer-preview/<int:entry_id>")
def printer_preview(entry_id):
    custom_columns = get_custom_field_column_names()
    entry_row = fetch_weighment_by_id(entry_id)
    entry = serialize_weighment_row(entry_row) if entry_row is not None else None
    if entry is None:
        abort(404)

    return render_template(
        "printer_preview.html",
        layout=get_saved_printer_layout(custom_columns, request.args.get("template")),
        entry=entry,
    )


@settings_bp.route("/printer-preview-draft")
def printer_preview_draft():
    custom_columns = get_custom_field_column_names()
    return render_template(
        "printer_preview.html",
        layout=get_saved_printer_layout(custom_columns, request.args.get("template")),
        entry=None,
    )
