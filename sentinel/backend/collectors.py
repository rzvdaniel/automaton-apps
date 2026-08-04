from __future__ import annotations

import os
import platform
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PSEUDO_FILESYSTEMS = {
    "autofs", "bpf", "cgroup", "cgroup2", "configfs", "debugfs", "devpts",
    "devtmpfs", "efivarfs", "fusectl", "hugetlbfs", "mqueue", "overlay",
    "proc", "pstore", "securityfs", "sysfs", "tmpfs", "tracefs",
}


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def parse_cpu_stat(text: str) -> tuple[int, int]:
    line = next((line for line in text.splitlines() if line.startswith("cpu ")), "")
    values = [int(value) for value in line.split()[1:]]
    if len(values) < 4:
        raise ValueError("invalid aggregate CPU line")
    total = sum(values)
    idle = values[3] + (values[4] if len(values) > 4 else 0)
    return total, idle


def cpu_percent(previous: tuple[int, int] | None, current: tuple[int, int]) -> float | None:
    if previous is None:
        return None
    total_delta = current[0] - previous[0]
    idle_delta = current[1] - previous[1]
    if total_delta <= 0 or idle_delta < 0:
        return None
    return round(max(0.0, min(100.0, (total_delta - idle_delta) * 100 / total_delta)), 1)


def parse_meminfo(text: str) -> dict[str, Any]:
    values: dict[str, int] = {}
    for line in text.splitlines():
        if ":" not in line:
            continue
        key, raw = line.split(":", 1)
        match = re.match(r"\s*(\d+)\s*(kB)?", raw)
        if match:
            amount = int(match.group(1))
            values[key] = amount * 1024 if match.group(2) else amount
    total = values.get("MemTotal", 0)
    available = values.get("MemAvailable", values.get("MemFree", 0))
    swap_total = values.get("SwapTotal", 0)
    swap_free = values.get("SwapFree", 0)
    if total <= 0:
        raise ValueError("missing memory total")
    used = max(0, total - available)
    swap_used = max(0, swap_total - swap_free)
    return {
        "totalBytes": total,
        "usedBytes": used,
        "availableBytes": available,
        "percent": round(used * 100 / total, 1),
        "swapTotalBytes": swap_total,
        "swapUsedBytes": swap_used,
        "swapPercent": round(swap_used * 100 / swap_total, 1) if swap_total else 0.0,
    }


def parse_uptime(text: str) -> float:
    value = float(text.split()[0])
    if value < 0:
        raise ValueError("negative uptime")
    return value


def parse_os_release(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in text.splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key] = value.strip().strip('"').strip("'")
    return values


def parse_network(text: str) -> dict[str, dict[str, int]]:
    interfaces: dict[str, dict[str, int]] = {}
    for line in text.splitlines()[2:]:
        if ":" not in line:
            continue
        name, raw = line.split(":", 1)
        name = name.strip()
        fields = raw.split()
        if not name or len(fields) < 16 or name == "lo":
            continue
        interfaces[name] = {"rxBytes": int(fields[0]), "txBytes": int(fields[8])}
    return interfaces


def network_rates(
    previous: tuple[float, dict[str, dict[str, int]]] | None,
    current_time: float,
    current: dict[str, dict[str, int]],
) -> dict[str, Any]:
    totals = {
        "rxBytes": sum(item["rxBytes"] for item in current.values()),
        "txBytes": sum(item["txBytes"] for item in current.values()),
    }
    result: dict[str, Any] = {**totals, "rxBytesPerSecond": None, "txBytesPerSecond": None}
    if previous is None:
        return result
    elapsed = current_time - previous[0]
    if elapsed <= 0:
        return result
    previous_totals = {
        "rxBytes": sum(item["rxBytes"] for item in previous[1].values()),
        "txBytes": sum(item["txBytes"] for item in previous[1].values()),
    }
    if totals["rxBytes"] >= previous_totals["rxBytes"]:
        result["rxBytesPerSecond"] = round((totals["rxBytes"] - previous_totals["rxBytes"]) / elapsed)
    if totals["txBytes"] >= previous_totals["txBytes"]:
        result["txBytesPerSecond"] = round((totals["txBytes"] - previous_totals["txBytes"]) / elapsed)
    return result


def parse_mounts(text: str) -> list[tuple[str, str]]:
    mounts: list[tuple[str, str]] = []
    seen: set[str] = set()
    for line in text.splitlines():
        fields = line.split()
        if len(fields) < 3:
            continue
        mountpoint = fields[1].replace("\\040", " ")
        fs_type = fields[2]
        if (
            fs_type in PSEUDO_FILESYSTEMS
            or not mountpoint.startswith("/")
            or mountpoint.startswith(("/proc", "/sys", "/dev", "/run"))
            or mountpoint in seen
        ):
            continue
        seen.add(mountpoint)
        mounts.append((mountpoint, fs_type))
    return mounts


@dataclass
class HostCollector:
    root: Path = Path("/host")

    def __post_init__(self) -> None:
        self._cpu_previous: tuple[int, int] | None = None
        self._network_previous: tuple[float, dict[str, dict[str, int]]] | None = None

    def cpu(self) -> dict[str, Any]:
        current = parse_cpu_stat(_read(self.root / "proc" / "stat"))
        usage = cpu_percent(self._cpu_previous, current)
        self._cpu_previous = current
        load = [float(value) for value in _read(self.root / "proc" / "loadavg").split()[:3]]
        if len(load) != 3:
            raise ValueError("invalid load averages")
        return {"percent": usage, "load1": load[0], "load5": load[1], "load15": load[2]}

    def memory(self) -> dict[str, Any]:
        return parse_meminfo(_read(self.root / "proc" / "meminfo"))

    def uptime(self) -> float:
        return parse_uptime(_read(self.root / "proc" / "uptime"))

    def system(self) -> dict[str, str]:
        release = parse_os_release(_read(self.root / "etc" / "os-release"))
        cpuinfo = _read(self.root / "proc" / "cpuinfo")
        cpu_model = "Unknown CPU"
        for line in cpuinfo.splitlines():
            if line.lower().startswith(("model name", "hardware", "processor")) and ":" in line:
                cpu_model = line.split(":", 1)[1].strip() or cpu_model
                break
        kernel = _read(self.root / "proc" / "sys" / "kernel" / "osrelease").strip()
        hostname = _read(self.root / "etc" / "hostname").strip()
        return {
            "hostname": hostname[:128] or "Unknown host",
            "os": release.get("PRETTY_NAME", release.get("NAME", "Unknown OS"))[:160],
            "kernel": kernel[:128],
            "architecture": platform.machine()[:64] or "Unknown",
            "cpuModel": cpu_model[:200],
        }

    def network(self, now: float) -> dict[str, Any]:
        current = parse_network(_read(self.root / "proc" / "net" / "dev"))
        result = network_rates(self._network_previous, now, current)
        self._network_previous = (now, current)
        result["interfaceCount"] = len(current)
        return result

    def disks(self) -> list[dict[str, Any]]:
        disks: list[dict[str, Any]] = []
        root_resolved = self.root.resolve()
        for mountpoint, fs_type in parse_mounts(_read(self.root / "proc" / "mounts")):
            target = (self.root / mountpoint.lstrip("/")).resolve()
            if target != root_resolved and root_resolved not in target.parents:
                continue
            try:
                stats = os.statvfs(target)
            except OSError:
                continue
            total = stats.f_frsize * stats.f_blocks
            available = stats.f_frsize * stats.f_bavail
            used = max(0, total - stats.f_frsize * stats.f_bfree)
            if total <= 0:
                continue
            disks.append({
                "mount": mountpoint,
                "filesystem": fs_type,
                "totalBytes": total,
                "usedBytes": used,
                "availableBytes": available,
                "percent": round(used * 100 / total, 1),
            })
        return disks
