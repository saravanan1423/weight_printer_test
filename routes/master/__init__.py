from flask import Blueprint

master_bp = Blueprint("master", __name__, url_prefix="/master")

from . import vehicle_number
from . import vehicle_type
from . import material
from . import customer
from . import credit_management