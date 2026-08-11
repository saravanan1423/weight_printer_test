import os
from pathlib import Path

from flask import Flask, redirect, send_from_directory, url_for

from flask_sqlalchemy import SQLAlchemy

from app_version import APP_VERSION
from models.models import db
from models.models import Vehicle_type,Material_name,Vehicle_details,Customer_details,Credit_management
from models.models import Custom_fields, Weighment_entry

from backup_manager import start_backup_scheduler
from routes.weightment.weightment import weightment_bp
from routes.master import master_bp
from routes.report.report import report_bp
from routes.settings import settings_bp

app = Flask(__name__)


@app.context_processor
def inject_app_version():
    return {"app_version": APP_VERSION}

data_dir = Path(os.environ.get("WEIGHMAN_DATA_DIR") or app.instance_path).resolve()
capture_dir = data_dir / "weighment_captures"
data_dir.mkdir(parents=True, exist_ok=True)
capture_dir.mkdir(parents=True, exist_ok=True)

app.config["WEIGHMAN_DATA_DIR"] = str(data_dir)
app.config["WEIGHMAN_CAPTURE_ROOT"] = str(capture_dir)
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{(data_dir / 'weighbridge_main.db').as_posix()}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)

# Create tables
with app.app_context():
    db.create_all()

start_backup_scheduler(app)

@app.route("/")
def home():
    return redirect(url_for("weightment.weightment"))


@app.route("/captures/<path:filename>")
def captures(filename):
    return send_from_directory(app.config["WEIGHMAN_CAPTURE_ROOT"], filename)

app.register_blueprint(weightment_bp)
app.register_blueprint(master_bp)
app.register_blueprint(report_bp)
app.register_blueprint(settings_bp)

if __name__ == "__main__":
    app.run(debug=True)
