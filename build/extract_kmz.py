#!/usr/bin/env python3
"""Extract and merge shelter locations from one or more KMZ files."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as et

from lxml import html

KML_NS = {"kml": "http://www.opengis.net/kml/2.2"}
DEDUP_DISTANCE_METERS = 10.0
DEDUP_CROSS_SOURCE_DISTANCE_METERS = 20.0
GENERIC_NAME_PATTERN = re.compile(r"^shelter\s+\d+$", re.IGNORECASE)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert KMZ shelter files to merged JSON"
    )
    parser.add_argument(
        "--input",
        "-i",
        action="append",
        default=None,
        help="Path to source KMZ file (can be provided multiple times)",
    )
    parser.add_argument(
        "--output",
        "-o",
        default="dist/data/shelters.json",
        help="Output JSON file path",
    )
    parser.add_argument(
        "--dedupe-distance",
        type=float,
        default=DEDUP_DISTANCE_METERS,
        help="Deduplication radius in meters",
    )
    parser.add_argument(
        "--cross-source-dedupe-distance",
        type=float,
        default=DEDUP_CROSS_SOURCE_DISTANCE_METERS,
        help="Deduplication radius in meters when comparing different source files",
    )
    return parser.parse_args()


def _clean_text(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<[^>]+>", " ", str(value))
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _autodetect_inputs(base_dir: Path) -> list[Path]:
    candidates = [
        base_dir / "data" / "sources",
        base_dir / "data",
        base_dir,
    ]

    files: list[Path] = []
    for folder in candidates:
        if folder.exists() and folder.is_dir():
            files.extend(sorted(folder.glob("*.kmz")))

    unique_files: list[Path] = []
    seen: set[Path] = set()
    for path in files:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique_files.append(resolved)

    if not unique_files:
        raise FileNotFoundError(
            "No KMZ file found in ./data/sources, ./data, or project root"
        )

    return unique_files


def _resolve_inputs(project_root: Path, cli_inputs: list[str] | None) -> list[Path]:
    if not cli_inputs:
        return _autodetect_inputs(project_root)

    resolved = []
    for item in cli_inputs:
        candidate = Path(item)
        if not candidate.is_absolute():
            candidate = project_root / candidate
        resolved.append(candidate.resolve())
    return resolved


def _load_kml_from_kmz(kmz_path: Path) -> bytes:
    with zipfile.ZipFile(kmz_path, "r") as archive:
        kml_names = [
            name for name in archive.namelist() if name.lower().endswith(".kml")
        ]
        if not kml_names:
            raise ValueError(f"No KML file found in {kmz_path}")
        selected = "doc.kml" if "doc.kml" in kml_names else kml_names[0]
        return archive.read(selected)


def _extract_extended_data(placemark: et.Element) -> dict[str, str]:
    data: dict[str, str] = {}

    for node in placemark.findall(".//kml:ExtendedData/kml:Data", KML_NS):
        key = node.attrib.get("name", "").strip()
        value = _clean_text(node.findtext("kml:value", default="", namespaces=KML_NS))
        if key and value:
            data[key] = value

    for node in placemark.findall(
        ".//kml:ExtendedData/kml:SchemaData/kml:SimpleData", KML_NS
    ):
        key = node.attrib.get("name", "").strip()
        value = _clean_text(node.text)
        if key and value:
            data[key] = value

    return data


def _normalize_field_value(value: str) -> str:
    cleaned = _clean_text(value)
    if cleaned.lower() in {"<null>", "null", "none", "nan"}:
        return ""
    return cleaned


def _parse_description_fields(raw_description: str) -> tuple[str, dict[str, str]]:
    raw_description = raw_description or ""

    if "<table" not in raw_description.lower() and "<tr" not in raw_description.lower():
        return _clean_text(raw_description), {}

    try:
        document = html.fromstring(raw_description)
    except Exception:
        return _clean_text(raw_description), {}

    fields: dict[str, str] = {}
    title = ""

    for row in document.xpath(".//tr"):
        cells = row.xpath("./td")
        texts = [_normalize_field_value(cell.text_content()) for cell in cells]

        if len(texts) == 1:
            if texts[0] and not title:
                title = texts[0]
            continue

        if len(texts) >= 2:
            key = texts[0]
            value = " ".join(part for part in texts[1:] if part)
            if key and value:
                fields[key] = value

    description_priority = [
        "הערות",
        "הערה",
        "תיאור",
        "תאור",
        "description",
        "Description",
    ]

    preferred_description = ""
    for key in description_priority:
        if fields.get(key):
            preferred_description = fields[key]
            break

    if not preferred_description:
        address = fields.get("כתובת") or fields.get("Address")
        if address:
            preferred_description = address

    if not preferred_description and fields:
        preview_pairs = [f"{key}: {value}" for key, value in list(fields.items())[:3]]
        preferred_description = " | ".join(preview_pairs)

    if not preferred_description:
        preferred_description = title

    return preferred_description, fields


def _parse_kmz(kmz_path: Path) -> list[dict[str, Any]]:
    kml_bytes = _load_kml_from_kmz(kmz_path)
    root = et.fromstring(kml_bytes)

    records: list[dict[str, Any]] = []
    for placemark in root.findall(".//kml:Placemark", KML_NS):
        coord_node = placemark.find(".//kml:Point/kml:coordinates", KML_NS)
        if coord_node is None or not coord_node.text:
            continue

        raw = [part.strip() for part in coord_node.text.strip().split(",")]
        if len(raw) < 2:
            continue

        try:
            lng = float(raw[0])
            lat = float(raw[1])
        except ValueError:
            continue

        name = _clean_text(
            placemark.findtext("kml:name", default="", namespaces=KML_NS)
        )
        raw_description = placemark.findtext(
            "kml:description", default="", namespaces=KML_NS
        )
        description, description_fields = _parse_description_fields(raw_description)
        extended_data = _extract_extended_data(placemark)
        for key, value in description_fields.items():
            if key and value and key not in extended_data:
                extended_data[key] = value

        records.append(
            {
                "name": name,
                "description": description,
                "lat": round(lat, 7),
                "lng": round(lng, 7),
                "source": kmz_path.name,
                "extended_data": extended_data,
            }
        )

    return records


def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_radius = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)

    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * earth_radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _metadata_score(record: dict[str, Any]) -> float:
    score = 0.0

    name = record.get("name", "")
    if name and not GENERIC_NAME_PATTERN.match(name):
        score += 4.0

    description = record.get("description", "")
    if description:
        score += min(4.0, len(description) / 40.0)

    ext = record.get("extended_data", {})
    non_empty_fields = sum(1 for value in ext.values() if str(value).strip())
    score += min(8.0, non_empty_fields * 1.5)

    for key in ext:
        lowered = key.lower()
        if any(
            token in lowered for token in ("address", "type", "note", "phone", "name")
        ):
            score += 0.5

    return score


def _record_sources(record: dict[str, Any]) -> set[str]:
    sources = set(record.get("sources", []))
    source = record.get("source")
    if source:
        sources.add(source)
    return sources


def _record_address(record: dict[str, Any]) -> str:
    extended = record.get("extended_data", {})
    address = _clean_text(extended.get("כתובת") or extended.get("Address") or "")
    return address.casefold()


def _is_generic_record(record: dict[str, Any]) -> bool:
    name = record.get("name", "")
    if GENERIC_NAME_PATTERN.match(name or ""):
        return True
    has_description = bool(_clean_text(record.get("description", "")))
    has_extended = bool(record.get("extended_data", {}))
    return not has_description and not has_extended


def _is_strict_generic_record(record: dict[str, Any]) -> bool:
    name = record.get("name", "")
    if not GENERIC_NAME_PATTERN.match(name or ""):
        return False
    has_description = bool(_clean_text(record.get("description", "")))
    has_extended = bool(record.get("extended_data", {}))
    return not has_description and not has_extended


def _is_rich_record(record: dict[str, Any]) -> bool:
    extended_fields = len(record.get("extended_data", {}))
    description_length = len(_clean_text(record.get("description", "")))
    return extended_fields >= 4 or description_length >= 30


def _pair_threshold_meters(
    left: dict[str, Any],
    right: dict[str, Any],
    base_threshold_meters: float,
    cross_source_threshold_meters: float,
) -> float:
    left_sources = _record_sources(left)
    right_sources = _record_sources(right)

    if left_sources == right_sources:
        if _is_generic_record(left) and _is_generic_record(right):
            return max(base_threshold_meters, 12.0)
        return base_threshold_meters

    left_address = _record_address(left)
    right_address = _record_address(right)
    if left_address and right_address and left_address == right_address:
        return max(cross_source_threshold_meters, 35.0)

    left_generic = _is_generic_record(left)
    right_generic = _is_generic_record(right)
    left_rich = _is_rich_record(left)
    right_rich = _is_rich_record(right)

    if (left_generic and right_rich) or (right_generic and left_rich):
        return cross_source_threshold_meters

    return max(base_threshold_meters, 12.0)


def _merge_sources(target: dict[str, Any], other: dict[str, Any]) -> None:
    merged_sources = _record_sources(target) | _record_sources(other)
    target["sources"] = sorted(merged_sources)


def _cross_source_generic_cleanup(
    records: list[dict[str, Any]],
    cross_source_threshold_meters: float,
) -> tuple[list[dict[str, Any]], int]:
    if not records:
        return records, 0

    cell_size_deg = cross_source_threshold_meters / 111320.0
    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    for index, record in enumerate(records):
        key = _grid_key(record["lat"], record["lng"], cell_size_deg)
        buckets[key].append(index)

    removed: set[int] = set()
    merges = 0

    for index, record in enumerate(records):
        if index in removed:
            continue
        if not _is_rich_record(record):
            continue

        key = _grid_key(record["lat"], record["lng"], cell_size_deg)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for other_index in buckets.get((key[0] + dy, key[1] + dx), []):
                    if other_index == index or other_index in removed:
                        continue
                    other = records[other_index]
                    if not _is_strict_generic_record(other):
                        continue

                    if _record_sources(record) == _record_sources(other):
                        continue

                    distance = _haversine_meters(
                        record["lat"],
                        record["lng"],
                        other["lat"],
                        other["lng"],
                    )
                    if distance > cross_source_threshold_meters:
                        continue

                    _merge_sources(record, other)
                    removed.add(other_index)
                    merges += 1

    kept = [record for idx, record in enumerate(records) if idx not in removed]
    return kept, merges


def _grid_key(lat: float, lng: float, cell_size_deg: float) -> tuple[int, int]:
    return (int(lat / cell_size_deg), int(lng / cell_size_deg))


def _dedupe_records(
    records: list[dict[str, Any]],
    threshold_meters: float,
    cross_source_threshold_meters: float,
) -> tuple[list[dict[str, Any]], int]:
    if not records:
        return [], 0

    max_threshold_meters = max(threshold_meters, cross_source_threshold_meters)
    cell_size_deg = max_threshold_meters / 111320.0
    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    merged: list[dict[str, Any]] = []
    duplicates = 0

    for candidate in records:
        lat = candidate["lat"]
        lng = candidate["lng"]
        key = _grid_key(lat, lng, cell_size_deg)

        best_match_index = None
        best_match_distance = float("inf")

        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                neighbor_key = (key[0] + dy, key[1] + dx)
                for index in buckets.get(neighbor_key, []):
                    existing = merged[index]
                    distance = _haversine_meters(
                        lat, lng, existing["lat"], existing["lng"]
                    )
                    pair_threshold = _pair_threshold_meters(
                        candidate,
                        existing,
                        base_threshold_meters=threshold_meters,
                        cross_source_threshold_meters=cross_source_threshold_meters,
                    )
                    if distance <= pair_threshold and distance < best_match_distance:
                        best_match_distance = distance
                        best_match_index = index

        if best_match_index is None:
            merged.append(candidate)
            buckets[key].append(len(merged) - 1)
            continue

        duplicates += 1
        existing = merged[best_match_index]
        if _metadata_score(candidate) > _metadata_score(existing):
            _merge_sources(candidate, existing)
            merged[best_match_index] = candidate
        else:
            _merge_sources(existing, candidate)

    return merged, duplicates


def _serialize_shelters(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    shelters: list[dict[str, Any]] = []
    for idx, record in enumerate(records, start=1):
        name = record.get("name") or f"Shelter {idx}"
        shelters.append(
            {
                "id": idx,
                "name": name,
                "lat": record["lat"],
                "lng": record["lng"],
                "description": record.get("description", ""),
                "source": record.get("source", ""),
                "sources": record.get("sources", [record.get("source", "")]),
            }
        )
    return shelters


def main() -> None:
    args = _parse_args()
    project_root = Path(__file__).resolve().parent.parent

    input_paths = _resolve_inputs(project_root, args.input)

    output_path = Path(args.output)
    if not output_path.is_absolute():
        output_path = project_root / output_path

    raw_records: list[dict[str, Any]] = []
    for input_path in input_paths:
        raw_records.extend(_parse_kmz(input_path))

    deduped_records, duplicates_removed = _dedupe_records(
        raw_records,
        threshold_meters=args.dedupe_distance,
        cross_source_threshold_meters=args.cross_source_dedupe_distance,
    )
    deduped_records, extra_cross_source_merges = _cross_source_generic_cleanup(
        deduped_records,
        cross_source_threshold_meters=args.cross_source_dedupe_distance,
    )
    shelters = _serialize_shelters(deduped_records)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "shelters": shelters,
        "metadata": {
            "count": len(shelters),
            "raw_count": len(raw_records),
            "duplicates_removed": duplicates_removed,
            "cross_source_generic_merges": extra_cross_source_merges,
            "dedupe_distance_meters": args.dedupe_distance,
            "dedupe_cross_source_distance_meters": args.cross_source_dedupe_distance,
            "generated": dt.datetime.now(dt.timezone.utc)
            .replace(microsecond=0)
            .isoformat(),
            "sources": [path.name for path in input_paths],
        },
    }

    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        "Wrote "
        f"{len(shelters)} shelters (from {len(raw_records)} raw points, "
        f"removed {duplicates_removed + extra_cross_source_merges} duplicates) to {output_path}"
    )


if __name__ == "__main__":
    main()
