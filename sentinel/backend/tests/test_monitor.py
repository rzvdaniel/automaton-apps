from typing import Any

from monitor import Monitor


class GoodHost:
    def cpu(self): return {"percent": 10.0}
    def memory(self): return {"percent": 20.0}
    def network(self, now): return {"rxBytesPerSecond": 1, "txBytesPerSecond": 2}
    def uptime(self): return 5.0
    def system(self): return {"hostname": "fixture"}
    def disks(self): return []


class GoodDocker:
    def collect(self): return []


class BadDocker:
    def collect(self): raise ConnectionError("secret socket detail")


def test_history_is_bounded() -> None:
    now = 1000.0

    def clock() -> float:
        nonlocal now
        now += 3
        return now

    monitor = Monitor(GoodHost(), GoodDocker(), clock=clock, history_limit=3)  # type: ignore[arg-type]
    for _ in range(7):
        monitor.sample()
    assert len(monitor.history()) == 3
    assert monitor.history()[0]["timestampMs"] == 1015_000


def test_docker_unavailable_is_sanitized_and_non_fatal() -> None:
    monitor = Monitor(GoodHost(), BadDocker(), clock=lambda: 1000.0)  # type: ignore[arg-type]
    result = monitor.sample()
    assert result["status"] == "degraded"
    assert result["containers"] is None
    assert result["cpu"] == {"percent": 10.0}
    assert result["warnings"] == ["Docker metrics are unavailable."]
    assert "secret" not in str(result)
