# -*- coding: utf-8 -*-
"""Arrival forecaster for MAPPO + Predictive Analytics inference."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np


def _parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        text = str(value).strip()
        if text.endswith("Z"):
            text = text.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(text)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _priority_to_triage(priority: Any) -> int:
    if priority is None:
        return 5
    if isinstance(priority, (int, float)):
        return int(np.clip(int(priority), 1, 5))
    text = str(priority).strip().lower()
    mapping = {
        "critical": 1,
        "triage 1": 1,
        "emergent": 2,
        "triage 2": 2,
        "urgent": 3,
        "triage 3": 3,
        "semi-urgent": 4,
        "triage 4": 4,
        "non-urgent": 5,
        "triage 5": 5,
    }
    if text in mapping:
        return mapping[text]
    for token in text.split():
        if token.isdigit():
            return int(np.clip(int(token), 1, 5))
    return 5


class ArrivalForecaster:
    """Predicts near-future patient load and critical-share from hourly patterns."""

    def __init__(
        self,
        horizon_hours: int = 6,
        rate_by_hour: dict[int, float] | None = None,
        crit_share_by_hour: dict[int, float] | None = None,
    ):
        self.horizon = horizon_hours
        self.rate_by_hour = rate_by_hour or {h: 0.5 for h in range(24)}
        self.crit_share_by_hour = crit_share_by_hour or {h: 0.2 for h in range(24)}
        self.max_expected = max(self.rate_by_hour.values()) * horizon_hours + 1e-6

    @classmethod
    def from_patient_records(
        cls,
        records: list[dict[str, Any]],
        horizon_hours: int = 6,
    ) -> "ArrivalForecaster":
        hours: list[int] = []
        critical_flags: list[int] = []

        for record in records:
            arrival = _parse_datetime(
                record.get("admissionTime")
                or record.get("arrival_time")
                or record.get("admission_time")
            )
            if arrival is None:
                continue
            hours.append(arrival.hour)
            triage = record.get("triageLevel", record.get("triage_level", record.get("priority")))
            critical_flags.append(1 if _priority_to_triage(triage) <= 2 else 0)

        if not hours:
            return cls(horizon_hours=horizon_hours)

        counts = {h: 0 for h in range(24)}
        crit_counts = {h: 0 for h in range(24)}
        crit_totals = {h: 0 for h in range(24)}

        for hour, is_crit in zip(hours, critical_flags):
            counts[hour] += 1
            crit_totals[hour] += 1
            crit_counts[hour] += is_crit

        total_days = max(len(set(hours)) / 24.0, 1.0)
        rate_by_hour = {h: counts[h] / total_days for h in range(24)}
        crit_share_by_hour = {
            h: (crit_counts[h] / crit_totals[h] if crit_totals[h] else 0.2)
            for h in range(24)
        }
        return cls(
            horizon_hours=horizon_hours,
            rate_by_hour=rate_by_hour,
            crit_share_by_hour=crit_share_by_hour,
        )

    @classmethod
    def from_profile_file(
        cls, profile_path: str | Path, horizon_hours: int = 6
    ) -> "ArrivalForecaster":
        path = Path(profile_path)
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)

        horizon = int(data.get("horizon_hours", horizon_hours))
        rate_by_hour = {int(k): float(v) for k, v in data["rate_by_hour"].items()}
        crit_share_by_hour = {int(k): float(v) for k, v in data["crit_share_by_hour"].items()}
        forecaster = cls(
            horizon_hours=horizon,
            rate_by_hour=rate_by_hour,
            crit_share_by_hour=crit_share_by_hour,
        )
        thresholds = data.get("surge_thresholds", {})
        forecaster.surge_thresholds = {
            "load": float(thresholds.get("load", 0.347)),
            "crit": float(thresholds.get("crit", 0.436)),
        }
        forecaster.profile_path = str(path)
        return forecaster

    def predict_details(self, current_time: datetime | None = None) -> dict[str, Any]:
        now = current_time or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        expected_arrivals = 0.0
        crit_shares: list[float] = []
        for offset in range(self.horizon):
            hour = (now + timedelta(hours=offset)).hour
            expected_arrivals += self.rate_by_hour.get(hour, 0.0)
            crit_shares.append(self.crit_share_by_hour.get(hour, 0.0))

        pred_load = min(expected_arrivals / self.max_expected, 1.0)
        pred_crit = float(np.mean(crit_shares)) if crit_shares else 0.0
        return {
            "pred_load": pred_load,
            "pred_crit": pred_crit,
            "expected_arrivals": expected_arrivals,
            "horizon_hours": self.horizon,
        }

    def predict(self, current_time: datetime | None = None) -> tuple[float, float]:
        details = self.predict_details(current_time)
        return details["pred_load"], details["pred_crit"]

    def is_surge(
        self,
        current_time: datetime | None = None,
        load_thresh: float = 0.347,
        crit_thresh: float = 0.436,
    ) -> bool:
        pred_load, pred_crit = self.predict(current_time)
        return pred_load > load_thresh and pred_crit > crit_thresh

    def snapshot(self, current_time: datetime | None = None) -> dict[str, Any]:
        details = self.predict_details(current_time)
        return {
            "pred_load": round(float(details["pred_load"]), 4),
            "pred_crit": round(float(details["pred_crit"]), 4),
            "expected_arrivals": round(float(details["expected_arrivals"]), 2),
            "horizon_hours": int(details["horizon_hours"]),
        }


def default_profile_path() -> Path:
    return Path(__file__).resolve().parent / "config" / "forecaster_profile.json"


def load_forecaster(
    ward_snapshot: dict[str, Any] | None = None,
    profile_path: str | Path | None = None,
) -> ArrivalForecaster:
    """Load forecaster from ward payload history, explicit profile, or bundled JSON."""
    ward_snapshot = ward_snapshot or {}
    horizon = int(ward_snapshot.get("forecasterHorizonHours", 6))

    history = ward_snapshot.get("patientHistory") or ward_snapshot.get("historicalPatients")
    if isinstance(history, list) and history:
        return ArrivalForecaster.from_patient_records(history, horizon_hours=horizon)

    resolved_profile = profile_path or ward_snapshot.get("forecasterProfilePath") or default_profile_path()
    if Path(resolved_profile).exists():
        return ArrivalForecaster.from_profile_file(resolved_profile, horizon_hours=horizon)

    forecaster = ArrivalForecaster(horizon_hours=horizon)
    forecaster.surge_thresholds = default_surge_thresholds()
    return forecaster


def default_surge_thresholds() -> dict[str, float]:
    path = default_profile_path()
    if path.exists():
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        thresholds = data.get("surge_thresholds", {})
        return {
            "load": float(thresholds.get("load", 0.347)),
            "crit": float(thresholds.get("crit", 0.436)),
        }
    return {"load": 0.347, "crit": 0.436}
