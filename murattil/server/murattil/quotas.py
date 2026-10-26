"""Fair-usage allowances. AI jobs reserve one unit when queued and are refunded if they fail, so a
server error never costs the user part of their daily allowance."""
from __future__ import annotations

import datetime as dt

from fastapi import HTTPException

from . import db
from .config import PlanLimits

KINDS = ("analysis", "transform")


def today() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")


def resets_at() -> str:
    t = dt.datetime.now(dt.timezone.utc)
    nxt = (t + dt.timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return nxt.isoformat()


def limit_for(plan: PlanLimits, kind: str) -> int:
    return plan.tajweed_analyses_per_day if kind == "analysis" else plan.voice_transforms_per_day


def used(user_id: str, kind: str, day: str | None = None) -> int:
    row = db.one("SELECT count FROM usage WHERE user_id = ? AND day = ? AND kind = ?", user_id, day or today(), kind)
    return int(row["count"]) if row else 0


def reserve(user_id: str, plan: PlanLimits, kind: str) -> str:
    day = today()
    lim = limit_for(plan, kind)
    with db.tx() as c:
        row = c.execute("SELECT count FROM usage WHERE user_id = ? AND day = ? AND kind = ?", (user_id, day, kind)).fetchone()
        n = int(row["count"]) if row else 0
        if n >= lim:
            what = "Tajweed analyses" if kind == "analysis" else "voice transformations"
            raise HTTPException(429, f"You have used today's {lim} free {what}. The allowance resets at 00:00 UTC.")
        c.execute("INSERT INTO usage(user_id, day, kind, count) VALUES (?,?,?,1) "
                  "ON CONFLICT(user_id, day, kind) DO UPDATE SET count = count + 1", (user_id, day, kind))
    return day


def refund(user_id: str, kind: str, day: str) -> None:
    db.run("UPDATE usage SET count = MAX(0, count - 1) WHERE user_id = ? AND day = ? AND kind = ?", user_id, day, kind)


def summary(user_id: str, plan: PlanLimits) -> dict:
    return {
        "analysis": {"used": used(user_id, "analysis"), "limit": plan.tajweed_analyses_per_day},
        "transform": {"used": used(user_id, "transform"), "limit": plan.voice_transforms_per_day},
        "resetsAt": resets_at(),
    }
