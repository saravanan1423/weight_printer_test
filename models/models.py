from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from zoneinfo._common import ZoneInfoNotFoundError

db = SQLAlchemy()


def now_ist():
    try:
        return datetime.now(ZoneInfo("Asia/Kolkata"))
    except ZoneInfoNotFoundError:
        return datetime.now(timezone(timedelta(hours=5, minutes=30)))

class Vehicle_type(db.Model):

    __tablename__ = "vehicle_type"

    id = db.Column(db.Integer, primary_key=True)
    vehicle_name = db.Column(db.String(50), nullable=False)
    created_at = db.Column(db.DateTime, default=now_ist)
    updated_at = db.Column(
        db.DateTime,
        default=now_ist,
        onupdate=now_ist
    )

    vehicle_details = db.relationship(
        "Vehicle_details",
        back_populates="vehicle_type",
        lazy=True
    )

class Material_name(db.Model):

    __tablename__ = "material_name"

    id = db.Column(db.Integer, primary_key=True)
    material_name = db.Column(db.String(50), nullable=False)
    created_at = db.Column(db.DateTime, default=now_ist)
    updated_at = db.Column(
        db.DateTime,
        default=now_ist,
        onupdate=now_ist
    )
    
class Customer_details(db.Model):

    __tablename__ = "customer_details"

    id = db.Column(db.Integer, primary_key=True)
    customer_name = db.Column(db.String(50), nullable=False)
    mobile_number = db.Column(db.String(10), nullable=True)
    mobile_number_2 = db.Column(db.String(10), nullable=True)
    created_at = db.Column(db.DateTime, default=now_ist)
    updated_at = db.Column(
        db.DateTime,
        default=now_ist,
        onupdate=now_ist
    )

    customer_credit = db.relationship(
        "Credit_management",
        back_populates="customer_details",
        lazy=True
    )

class Vehicle_details(db.Model):

    __tablename__ = "vehicle_details"

    id = db.Column(db.Integer, primary_key=True)
    vehicle_number = db.Column(db.String(12), nullable=False, unique=True)
    rfi_number = db.Column(db.String(30), nullable=True, default=None)
    tare_weight = db.Column(db.Float, nullable=False,default=0.0)

    vehicle_type_id = db.Column(db.Integer, db.ForeignKey("vehicle_type.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=now_ist)
    updated_at = db.Column(
        db.DateTime,
        default=now_ist,
        onupdate=now_ist
    )

    vehicle_type = db.relationship(
        "Vehicle_type",
        back_populates="vehicle_details"
    )

class Credit_management(db.Model):

    __tablename__ = "credit_management"

    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customer_details.id"), nullable=False)
    credit_amount = db.Column(db.Float, nullable=False, default=0.0)
    used_amount = db.Column(db.Float, nullable=False, default=0.0)
    created_at = db.Column(db.DateTime, default=now_ist)
    updated_at = db.Column(
        db.DateTime,
        default=now_ist,
        onupdate=now_ist
    )

    customer_details = db.relationship(
        "Customer_details",
        back_populates="customer_credit"
    )

class Custom_fields(db.Model):

    __tablename__ = "custom_fields"

    id = db.Column(db.Integer, primary_key=True)

    created_at = db.Column(db.DateTime, default=now_ist)
    updated_at = db.Column(
        db.DateTime,
        default=now_ist,
        onupdate=now_ist
    )


class Weighment_entry(db.Model):

    __tablename__ = "weighment_entries"

    id = db.Column(db.Integer, primary_key=True)
    serial_no = db.Column(db.String(30), nullable=False)
    ref_no = db.Column(db.String(30), nullable=False)
    entry_date = db.Column(db.String(20), nullable=False)
    entry_time = db.Column(db.String(20), nullable=False)
    vehicle_number = db.Column(db.String(20), nullable=False)
    weighing_type = db.Column(db.String(30), nullable=False)
    material = db.Column(db.String(50), nullable=False)
    customer = db.Column(db.String(50), nullable=False)
    mobile_no = db.Column(db.String(10), nullable=False)
    payment_mode = db.Column(db.String(30), nullable=False)
    charges = db.Column(db.Float, nullable=True)
    gross_weight = db.Column(db.Float, nullable=True)
    gross_date = db.Column(db.String(20), nullable=True)
    gross_time = db.Column(db.String(20), nullable=True)
    tare_weight = db.Column(db.Float, nullable=True)
    tare_date = db.Column(db.String(20), nullable=True)
    tare_time = db.Column(db.String(20), nullable=True)
    net_weight = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=now_ist)
    updated_at = db.Column(
        db.DateTime,
        default=now_ist,
        onupdate=now_ist
    )


class Report_column_layout(db.Model):

    __tablename__ = "report_column_layout"

    id = db.Column(db.Integer, primary_key=True)
    layout_name = db.Column(db.String(50), nullable=False, unique=True, default="default")
    column_keys = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=now_ist)
    updated_at = db.Column(
        db.DateTime,
        default=now_ist,
        onupdate=now_ist
    )


class Printer_layout(db.Model):

    __tablename__ = "printer_layout"

    id = db.Column(db.Integer, primary_key=True)
    layout_name = db.Column(db.String(50), nullable=False, unique=True, default="default")
    layout_json = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=now_ist)
    updated_at = db.Column(
        db.DateTime,
        default=now_ist,
        onupdate=now_ist
    )


class Communication_port_settings(db.Model):

    __tablename__ = "communication_port_setting"

    id = db.Column(db.Integer, primary_key=True)
    port_name = db.Column(db.String(50), nullable=False)
    baud_rate = db.Column(db.Integer, nullable=False)
    timeout = db.Column(db.Integer, nullable=False, default=1000)
    data_bits = db.Column(db.Integer, nullable=False)
    parity = db.Column(db.String(20), nullable=False)
    stop_bits = db.Column(db.Float, nullable=False)
    start_character = db.Column(db.String(8), nullable=False, default="")
    end_character = db.Column(db.String(8), nullable=False, default="")
    start_address = db.Column(db.Integer, nullable=False, default=0)
    end_address = db.Column(db.Integer, nullable=False, default=0)
    reverse_weight = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=now_ist)
    updated_at = db.Column(
        db.DateTime,
        default=now_ist,
        onupdate=now_ist
    )

class Communication_error_log(db.Model):

    __tablename__ = "communication_error_log"

    id = db.Column(db.Integer, primary_key=True)
    error_log = db.Column(db.String(255), nullable=False)
    timestamp = db.Column(db.DateTime, default=now_ist)


class Camera_settings(db.Model):

    __tablename__ = "camera_settings"

    id = db.Column(db.Integer, primary_key=True)
    camera_no = db.Column(db.Integer, nullable=False, unique=True)
    ip_address = db.Column(db.String(100), nullable=False)
    username = db.Column(db.String(100), nullable=False)
    password = db.Column(db.String(100), nullable=False)
    port = db.Column(db.Integer, nullable=False, default=554)
    stream_path = db.Column(db.String(255), nullable=False, default="Streaming/Channels/101")
    is_connected = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=now_ist)
    updated_at = db.Column(
        db.DateTime,
        default=now_ist,
        onupdate=now_ist
    )


class Camera_error_log(db.Model):

    __tablename__ = "camera_error_log"

    id = db.Column(db.Integer, primary_key=True)
    error_log = db.Column(db.String(255), nullable=False)
    timestamp = db.Column(db.DateTime, default=now_ist)


class Email_settings(db.Model):

    __tablename__ = "email_settings"

    id = db.Column(db.Integer, primary_key=True)
    smtp_host = db.Column(db.String(150), nullable=False)
    smtp_port = db.Column(db.Integer, nullable=False)
    security = db.Column(db.String(20), nullable=False, default="TLS")
    sender_email = db.Column(db.String(150), nullable=False)
    username = db.Column(db.String(150), nullable=False)
    password = db.Column(db.String(150), nullable=False)
    test_recipient = db.Column(db.String(150), nullable=False)
    is_connected = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=now_ist)
    updated_at = db.Column(
        db.DateTime,
        default=now_ist,
        onupdate=now_ist
    )


class Email_error_log(db.Model):

    __tablename__ = "email_error_log"

    id = db.Column(db.Integer, primary_key=True)
    error_log = db.Column(db.String(255), nullable=False)
    timestamp = db.Column(db.DateTime, default=now_ist)

