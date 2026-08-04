from __future__ import annotations

import logging
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Callable

from collectors import HostCollector
from docker_client import DockerClient


logger = logging.getLogger("sentinel")
HISTORY_LIMIT = 300


class Monitor:
    def __init__(
        self,
        host: HostCollector | None = None,
        docker: DockerClient | None = None,
        clock: Callable[[], float] = time.time,
        history_limit: int = HISTORY_LIMIT,
    ) -> None:
        self.host = host or HostCollector()
        self.docker = docker or DockerClient()
        self.clock = clock
        self._history: deque[dict[str, Any]] = deque(maxlen=history_limit)
        self._snapshot: dict[str, Any] | None = None
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._failure_state: dict[str, bool] = {}

    def _collect(self, name: str, operation: Callable[[], Any], warnings: list[str]) -> Any:
        try:
            value = operation()
            if self._failure_state.get(name):
                logger.info("Collector recovered: %s", name)
            self._failure_state[name] = False
            return value
        except Exception as error:
            if not self._failure_state.get(name):
                logger.warning("Collector unavailable: %s (%s)", name, type(error).__name__)
            self._failure_state[name] = True
            warnings.append(f"{name.capitalize()} metrics are unavailable.")
            return None

    def sample(self) -> dict[str, Any]:
        timestamp = self.clock()
        warnings: list[str] = []
        snapshot = {
            "timestamp": datetime.fromtimestamp(timestamp, timezone.utc).isoformat(),
            "timestampMs": round(timestamp * 1000),
            "cpu": self._collect("cpu", self.host.cpu, warnings),
            "memory": self._collect("memory", self.host.memory, warnings),
            "network": self._collect("network", lambda: self.host.network(timestamp), warnings),
            "uptimeSeconds": self._collect("uptime", self.host.uptime, warnings),
            "system": self._collect("system", self.host.system, warnings),
            "disks": self._collect("disk", self.host.disks, warnings),
            "containers": self._collect("docker", self.docker.collect, warnings),
            "warnings": warnings,
        }
        snapshot["status"] = "healthy" if not warnings else "degraded"
        point = {
            "timestampMs": snapshot["timestampMs"],
            "cpuPercent": (snapshot["cpu"] or {}).get("percent"),
            "memoryPercent": (snapshot["memory"] or {}).get("percent"),
            "networkRxBytesPerSecond": (snapshot["network"] or {}).get("rxBytesPerSecond"),
            "networkTxBytesPerSecond": (snapshot["network"] or {}).get("txBytesPerSecond"),
        }
        with self._lock:
            self._snapshot = snapshot
            self._history.append(point)
        return snapshot

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            current = self._snapshot
        return current or self.sample()

    def history(self) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._history)

    def start(self, interval: float = 3.0) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()

        def run() -> None:
            while not self._stop.is_set():
                started = time.monotonic()
                self.sample()
                self._stop.wait(max(0.0, interval - (time.monotonic() - started)))

        self._thread = threading.Thread(target=run, name="sentinel-sampler", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
