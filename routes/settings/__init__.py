from flask import Blueprint

settings_bp = Blueprint("settings", __name__, url_prefix="/settings")

from . import communication, custom_field, delete_setting, camera, email, whatsapp, printer, admin, backup
