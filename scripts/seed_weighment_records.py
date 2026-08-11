#!/usr/bin/env python3

from __future__ import annotations

import argparse
import random
import re
import shutil
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Iterable
from zoneinfo import ZoneInfo

from sqlalchemy import text

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app import app
from models.models import Customer_details, Material_name, Vehicle_details, Vehicle_type, db
from routes.weightment.weightment import (
    WEIGHMENT_TABLE,
    ensure_weighment_schema,
    format_ref_no,
    get_custom_field_column_names,
    quote_identifier,
)


TZ = ZoneInfo("Asia/Kolkata")
VEHICLE_TYPE_NAMES = [
    "Seed 6 Wheeler",
    "Seed 10 Wheeler",
    "Seed Tanker",
    "Seed Trailer",
]
PAYMENT_MODES = ("Cash", "Credit")
WEIGHING_TYPES = ("LOAD", "UNLOAD")


@dataclass
class CustomerSeed:
    name: str
    mobile: str


@dataclass
class VehicleSeed:
    vehicle_number: str
    tare_weight: float
    vehicle_type_id: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Seed weighment masters and report-visible weighment entries with two "
            "camera images copied from paths you choose."
        )
    )
    parser.add_argument("--count", type=int, default=100, help="Number of weighment records to insert. Default: 100")
    parser.add_argument("--image-1", required=True, help="Path to the first image file")
    parser.add_argument("--image-2", required=True, help="Path to the second image file")
    parser.add_argument(
        "--date-span",
        type=int,
        default=7,
        help="Spread records across the last N days so they show in recent reports. Default: 7",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=20260608,
        help="Random seed for repeatable sample data. Default: 20260608",
    )
    return parser.parse_args()


def require_image(path_value: str) -> Path:
    path = Path(path_value).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Image file not found: {path}")
    return path


def customer_specs(total: int) -> list[CustomerSeed]:
    needed = max(20, min(total, 40))
    specs = []
    for index in range(1, needed + 1):
        specs.append(
            CustomerSeed(
                name=f"Seed Customer {index:03d}",
                mobile=str(9000000000 + index),
            )
        )
    return specs


def material_names(total: int) -> list[str]:
    needed = max(10, min(20, max(1, total // 5)))
    return [f"Seed Material {index:02d}" for index in range(1, needed + 1)]


def vehicle_number_for(index: int) -> str:
    return f"TN36S{index:05d}"


def rfi_number_for(index: int) -> str:
    return f"SEEDRFI{index:05d}"


def ensure_vehicle_types() -> list[Vehicle_type]:
    existing = {row.vehicle_name: row for row in Vehicle_type.query.all()}
    created = 0
    for name in VEHICLE_TYPE_NAMES:
        if name in existing:
            continue
        db.session.add(Vehicle_type(vehicle_name=name))
        created += 1
    if created:
        db.session.commit()
    return [Vehicle_type.query.filter_by(vehicle_name=name).first() for name in VEHICLE_TYPE_NAMES]


def ensure_materials(total: int) -> list[Material_name]:
    names = material_names(total)
    existing = {row.material_name.lower(): row for row in Material_name.query.all()}
    created = 0
    for name in names:
        if name.lower() in existing:
            continue
        db.session.add(Material_name(material_name=name))
        created += 1
    if created:
        db.session.commit()
    return [Material_name.query.filter_by(material_name=name).first() for name in names]


def ensure_customers(total: int) -> list[Customer_details]:
    specs = customer_specs(total)
    existing = {
        (row.customer_name.lower(), row.mobile_number): row
        for row in Customer_details.query.all()
    }
    created = 0
    for spec in specs:
        key = (spec.name.lower(), spec.mobile)
        if key in existing:
            continue
        db.session.add(Customer_details(customer_name=spec.name, mobile_number=spec.mobile))
        created += 1
    if created:
        db.session.commit()
    return [
        Customer_details.query.filter_by(customer_name=spec.name, mobile_number=spec.mobile).first()
        for spec in specs
    ]


def ensure_vehicles(total: int, vehicle_types: Iterable[Vehicle_type], rng: random.Random) -> list[VehicleSeed]:
    type_rows = [row for row in vehicle_types if row is not None]
    if not type_rows:
        raise RuntimeError("No vehicle types are available to seed vehicles")

    existing_numbers = {row.vehicle_number for row in Vehicle_details.query.all()}
    created = 0
    for index in range(1, total + 1):
        vehicle_number = vehicle_number_for(index)
        if vehicle_number in existing_numbers:
            continue
        tare_weight = float(rng.randint(8500, 18000))
        db.session.add(
            Vehicle_details(
                vehicle_number=vehicle_number,
                rfi_number=rfi_number_for(index),
                tare_weight=tare_weight,
                vehicle_type_id=type_rows[(index - 1) % len(type_rows)].id,
            )
        )
        created += 1
    if created:
        db.session.commit()

    rows = []
    for index in range(1, total + 1):
        vehicle_number = vehicle_number_for(index)
        row = Vehicle_details.query.filter_by(vehicle_number=vehicle_number).first()
        rows.append(
            VehicleSeed(
                vehicle_number=row.vehicle_number,
                tare_weight=float(row.tare_weight or 0),
                vehicle_type_id=row.vehicle_type_id,
            )
        )
    return rows


def existing_serial_counts() -> dict[str, int]:
    rows = db.session.execute(
        text(f"SELECT entry_date, COUNT(*) AS total FROM {WEIGHMENT_TABLE} GROUP BY entry_date")
    ).all()
    return {entry_date: int(total or 0) for entry_date, total in rows}


def existing_ref_counters() -> dict[str, int]:
    counters: dict[str, int] = {}
    rows = db.session.execute(text(f"SELECT entry_date, ref_no FROM {WEIGHMENT_TABLE}")).all()
    for entry_date, ref_no in rows:
        match = re.search(r"(\d+)$", ref_no or "")
        if not match:
            continue
        counters[entry_date] = max(counters.get(entry_date, 0), int(match.group(1)))
    return counters


def pick_date_pool(span: int) -> list[date]:
    if span < 1:
        raise ValueError("--date-span must be at least 1")
    today = datetime.now(TZ).date()
    return [today - timedelta(days=offset) for offset in range(span)]


def time_string(value: datetime) -> str:
    return value.strftime("%I:%M:%S %p")


def short_time_string(value: datetime) -> str:
    return value.strftime("%I:%M %p")


def slash_date_string(value: date) -> str:
    return value.strftime("%d/%m/%Y")


def static_root() -> Path:
    return Path(app.static_folder or (Path(app.root_path) / "static"))


def copy_seed_images(image_1: Path, image_2: Path, run_label: str, record_number: int) -> tuple[str, str]:
    relative_dir = Path("weighment_captures") / "seed_records" / run_label / f"record_{record_number:03d}"
    target_dir = static_root() / relative_dir
    target_dir.mkdir(parents=True, exist_ok=True)

    first_name = f"camera_1{image_1.suffix or '.jpg'}"
    second_name = f"camera_2{image_2.suffix or '.jpg'}"
    shutil.copy2(image_1, target_dir / first_name)
    shutil.copy2(image_2, target_dir / second_name)

    return (
        f"/static/{(relative_dir / first_name).as_posix()}",
        f"/static/{(relative_dir / second_name).as_posix()}",
    )


def build_custom_values(record_number: int) -> dict[str, str | None]:
    values = {}
    for column in get_custom_field_column_names():
        values[column] = f"Seed {column.replace('_', ' ').title()} {record_number:03d}"
    return values


def insert_record(insert_values: dict[str, object]) -> None:
    column_sql = ", ".join(quote_identifier(column) for column in insert_values)
    value_sql = ", ".join(f":{column}" for column in insert_values)
    db.session.execute(
        text(f"INSERT INTO {WEIGHMENT_TABLE} ({column_sql}) VALUES ({value_sql})"),
        insert_values,
    )


def seed_records(args: argparse.Namespace) -> None:
    if args.count < 1:
        raise ValueError("--count must be at least 1")

    image_1 = require_image(args.image_1)
    image_2 = require_image(args.image_2)
    rng = random.Random(args.seed)

    with app.app_context():
        ensure_weighment_schema()

        vehicle_types = ensure_vehicle_types()
        materials = ensure_materials(args.count)
        customers = ensure_customers(args.count)
        vehicles = ensure_vehicles(args.count, vehicle_types, rng)

        serial_counts = existing_serial_counts()
        ref_counters = existing_ref_counters()
        date_pool = pick_date_pool(args.date_span)
        custom_columns = get_custom_field_column_names()
        run_label = datetime.now(TZ).strftime("%Y%m%d-%H%M%S")
        now = datetime.now(TZ)

        for index in range(args.count):
            record_number = index + 1
            entry_date_obj = date_pool[index % len(date_pool)]
            entry_date = entry_date_obj.isoformat()
            vehicle = vehicles[index % len(vehicles)]
            customer = customers[(index * 3) % len(customers)]
            material = materials[(index * 5) % len(materials)]

            tare_weight = vehicle.tare_weight
            net_weight = float(rng.randint(8500, 24000))
            gross_weight = tare_weight + net_weight
            charges = round(rng.uniform(150, 650), 2)

            hour = rng.randint(6, 20)
            minute = rng.randint(0, 59)
            second = rng.randint(0, 59)
            entry_dt = datetime.combine(entry_date_obj, time(hour, minute, second), tzinfo=TZ)
            tare_dt = entry_dt + timedelta(minutes=rng.randint(10, 80))

            serial_no = str(serial_counts.get(entry_date, 0) + 1)
            serial_counts[entry_date] = int(serial_no)

            next_ref = ref_counters.get(entry_date, 0) + 1
            ref_counters[entry_date] = next_ref
            ref_no = format_ref_no(next_ref)

            camera_1_image, camera_2_image = copy_seed_images(image_1, image_2, run_label, record_number)
            custom_values = build_custom_values(record_number)

            insert_values: dict[str, object] = {
                "serial_no": serial_no,
                "ref_no": ref_no,
                "entry_date": entry_date,
                "entry_time": time_string(entry_dt),
                "vehicle_number": vehicle.vehicle_number,
                "weighing_type": WEIGHING_TYPES[index % len(WEIGHING_TYPES)],
                "material": material.material_name,
                "customer": customer.customer_name,
                "mobile_no": customer.mobile_number,
                "payment_mode": PAYMENT_MODES[index % len(PAYMENT_MODES)],
                "charges": charges,
                "gross_weight": gross_weight,
                "gross_date": slash_date_string(entry_date_obj),
                "gross_time": short_time_string(entry_dt),
                "tare_weight": tare_weight,
                "tare_date": slash_date_string(entry_date_obj),
                "tare_time": short_time_string(tare_dt),
                "net_weight": net_weight,
                "camera_1_image": camera_1_image,
                "camera_2_image": camera_2_image,
                "camera_3_image": None,
                "camera_4_image": None,
                "created_at": now,
                "updated_at": now,
            }
            for column in custom_columns:
                insert_values[column] = custom_values.get(column)

            insert_record(insert_values)

        db.session.commit()

    print(f"Seeded {args.count} weighment records.")
    print(f"Image 1 source: {image_1}")
    print(f"Image 2 source: {image_2}")
    print("Master data was created as needed for vehicle types, vehicles, materials, and customers.")


def main() -> None:
    args = parse_args()
    seed_records(args)


if __name__ == "__main__":
    main()
