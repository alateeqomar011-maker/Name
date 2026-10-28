"""Runtime configuration, read once from environment variables.

Every limit the app enforces lives here so that the numbers shown to users in the UI
(fair-usage page, upload hints) come from the same source as the numbers the server enforces.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent
DATA_DIR = PACKAGE_DIR / "data"


def _env_path(name: str, default: Path) -> Path:
    return Path(os.environ.get(name, str(default))).expanduser().resolve()


def _env_int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


def _env_bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class PlanLimits:
    name: str
    # daily allowances (reset at 00:00 UTC)
    tajweed_analyses_per_day: int
    voice_transforms_per_day: int
    # per-recording limits
    max_tajweed_seconds: int
    max_transform_seconds: int
    max_upload_mb: int
    # storage
    max_recordings: int
    max_storage_mb: int


FREE_PLAN = PlanLimits(
    name="free",
    tajweed_analyses_per_day=_env_int("MURATTIL_FREE_ANALYSES_PER_DAY", 30),
    voice_transforms_per_day=_env_int("MURATTIL_FREE_TRANSFORMS_PER_DAY", 8),
    max_tajweed_seconds=_env_int("MURATTIL_FREE_MAX_TAJWEED_SECONDS", 120),
    max_transform_seconds=_env_int("MURATTIL_FREE_MAX_TRANSFORM_SECONDS", 45),
    max_upload_mb=_env_int("MURATTIL_FREE_MAX_UPLOAD_MB", 25),
    max_recordings=_env_int("MURATTIL_FREE_MAX_RECORDINGS", 100),
    max_storage_mb=_env_int("MURATTIL_FREE_MAX_STORAGE_MB", 300),
)

# Not sold anywhere yet: there is no payment integration. The limits exist so an operator can grant
# the plan to an account from the admin CLI (e.g. for teachers), and so the UI can describe it honestly.
SUPPORTER_PLAN = PlanLimits(
    name="supporter",
    tajweed_analyses_per_day=_env_int("MURATTIL_SUPPORTER_ANALYSES_PER_DAY", 200),
    voice_transforms_per_day=_env_int("MURATTIL_SUPPORTER_TRANSFORMS_PER_DAY", 60),
    max_tajweed_seconds=_env_int("MURATTIL_SUPPORTER_MAX_TAJWEED_SECONDS", 600),
    max_transform_seconds=_env_int("MURATTIL_SUPPORTER_MAX_TRANSFORM_SECONDS", 240),
    max_upload_mb=_env_int("MURATTIL_SUPPORTER_MAX_UPLOAD_MB", 80),
    max_recordings=_env_int("MURATTIL_SUPPORTER_MAX_RECORDINGS", 2000),
    max_storage_mb=_env_int("MURATTIL_SUPPORTER_MAX_STORAGE_MB", 5000),
)

PLANS = {p.name: p for p in (FREE_PLAN, SUPPORTER_PLAN)}


@dataclass(frozen=True)
class Settings:
    var_dir: Path = field(default_factory=lambda: _env_path("MURATTIL_VAR_DIR", PACKAGE_DIR.parent / "var"))
    models_dir: Path = field(default_factory=lambda: _env_path("MURATTIL_MODELS_DIR", PACKAGE_DIR.parent / "models"))
    web_dist: Path = field(default_factory=lambda: _env_path("MURATTIL_WEB_DIST", PACKAGE_DIR.parent.parent / "web" / "dist"))
    # Cookies are marked Secure unless explicitly running over plain http in development.
    secure_cookies: bool = field(default_factory=lambda: _env_bool("MURATTIL_SECURE_COOKIES", True))
    # Number of background worker threads for AI jobs. Each job may itself use several BLAS threads.
    workers: int = field(default_factory=lambda: _env_int("MURATTIL_WORKERS", 2))
    torch_threads: int = field(default_factory=lambda: _env_int("MURATTIL_TORCH_THREADS", 2))
    # Global safety valve: refuse new AI jobs when this many are already queued.
    max_queue: int = field(default_factory=lambda: _env_int("MURATTIL_MAX_QUEUE", 50))
    # Reference audio is fetched from these hosts only (server-side requests).
    reference_hosts: tuple[str, ...] = field(default_factory=lambda: tuple(
        os.environ.get(
            "MURATTIL_REFERENCE_HOSTS",
            "everyayah.com,verses.quran.com,mirrors.quranicaudio.com,download.quranicaudio.com,"
            "mp3quran.net,www.mp3quran.net",
        ).split(",")
    ) + tuple(f"server{i}.mp3quran.net" for i in range(1, 17)))
    http_timeout: float = field(default_factory=lambda: float(os.environ.get("MURATTIL_HTTP_TIMEOUT", "20")))
    admin_token: str | None = field(default_factory=lambda: os.environ.get("MURATTIL_ADMIN_TOKEN") or None)
    # Load the speech-recognition model in the background at startup.
    warm_up: bool = field(default_factory=lambda: _env_bool("MURATTIL_WARM_UP", True))

    @property
    def db_path(self) -> Path:
        return self.var_dir / "murattil.sqlite3"

    @property
    def recordings_dir(self) -> Path:
        return self.var_dir / "recordings"

    @property
    def cache_dir(self) -> Path:
        return self.var_dir / "cache"


settings = Settings()
