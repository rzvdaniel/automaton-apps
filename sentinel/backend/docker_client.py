from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import httpx


SAFE_ID = re.compile(r"^[a-f0-9]{12,64}$")


def calculate_cpu_percent(stats: dict[str, Any]) -> float | None:
    cpu = stats.get("cpu_stats") or {}
    previous = stats.get("precpu_stats") or {}
    cpu_delta = (cpu.get("cpu_usage") or {}).get("total_usage", 0) - (previous.get("cpu_usage") or {}).get("total_usage", 0)
    system_delta = cpu.get("system_cpu_usage", 0) - previous.get("system_cpu_usage", 0)
    online = cpu.get("online_cpus") or len((cpu.get("cpu_usage") or {}).get("percpu_usage") or []) or 1
    if cpu_delta < 0 or system_delta <= 0:
        return None
    return round(cpu_delta / system_delta * online * 100, 1)


def sanitize_container(container: dict[str, Any], stats: dict[str, Any], inspect: dict[str, Any]) -> dict[str, Any]:
    container_id = str(container.get("Id", ""))
    names = container.get("Names") or []
    name = str(names[0]).lstrip("/") if names else "Unnamed"
    state = str(container.get("State", "unknown"))
    status = str(container.get("Status", "Unknown"))
    health = str(((inspect.get("State") or {}).get("Health") or {}).get("Status") or "none")
    memory = stats.get("memory_stats") or {}
    usage = max(0, int(memory.get("usage") or 0) - int((memory.get("stats") or {}).get("cache") or 0))
    limit = int(memory.get("limit") or 0)
    return {
        "id": container_id[:12],
        "name": name[:160],
        "image": str(container.get("Image", "Unknown"))[:240],
        "state": state[:32],
        "status": status[:160],
        "health": health[:32],
        "cpuPercent": calculate_cpu_percent(stats),
        "memoryUsageBytes": usage,
        "memoryPercent": round(usage * 100 / limit, 1) if limit > 0 else None,
        "restartCount": max(0, int(inspect.get("RestartCount") or 0)),
    }


class DockerClient:
    def __init__(self, socket_path: str = "/var/run/docker.sock", timeout: float = 2.0, max_containers: int = 100) -> None:
        self.socket_path = socket_path
        self.timeout = timeout
        self.max_containers = max_containers

    def _get(self, client: httpx.Client, path: str) -> Any:
        response = client.get(f"http://docker{path}")
        response.raise_for_status()
        if len(response.content) > 8 * 1024 * 1024:
            raise ValueError("Docker response exceeded size limit")
        return response.json()

    def collect(self) -> list[dict[str, Any]]:
        transport = httpx.HTTPTransport(uds=self.socket_path, retries=0)
        with httpx.Client(transport=transport, timeout=self.timeout) as client:
            listed = self._get(client, "/containers/json?all=1")
            if not isinstance(listed, list):
                raise ValueError("invalid Docker container list")
            containers = [item for item in listed[: self.max_containers] if SAFE_ID.fullmatch(str(item.get("Id", "")))]

        def detail(container: dict[str, Any]) -> dict[str, Any] | None:
            container_id = str(container["Id"])
            local_transport = httpx.HTTPTransport(uds=self.socket_path, retries=0)
            with httpx.Client(transport=local_transport, timeout=self.timeout) as local:
                try:
                    stats = self._get(local, f"/containers/{container_id}/stats?stream=false")
                    inspect = self._get(local, f"/containers/{container_id}/json")
                    return sanitize_container(container, stats, inspect)
                except (httpx.HTTPError, ValueError, TypeError):
                    return sanitize_container(container, {}, {})

        results: list[dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=min(6, max(1, len(containers)))) as pool:
            futures = [pool.submit(detail, item) for item in containers]
            for future in as_completed(futures):
                item = future.result()
                if item is not None:
                    results.append(item)
        return sorted(results, key=lambda item: item["name"].lower())
