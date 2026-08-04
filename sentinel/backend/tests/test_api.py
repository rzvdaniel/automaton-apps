from fastapi.testclient import TestClient

import main


class FakeMonitor:
    def snapshot(self):
        return {"status": "healthy", "timestamp": "2026-08-04T12:00:00+00:00", "warnings": [], "cpu": {"percent": 12}}

    def history(self):
        return [{"timestampMs": 1, "cpuPercent": 12}]

    def start(self): pass
    def stop(self): pass


def test_health_snapshot_and_history(monkeypatch) -> None:
    monkeypatch.setattr(main, "monitor", FakeMonitor())
    with TestClient(main.app) as client:
        health = client.get("/api/health")
        snapshot = client.get("/api/snapshot")
        history = client.get("/api/history")
    assert health.status_code == snapshot.status_code == history.status_code == 200
    assert health.json() == {"status": "healthy", "sampledAt": "2026-08-04T12:00:00+00:00", "warnings": []}
    assert snapshot.json()["cpu"]["percent"] == 12
    assert history.json()["retentionSeconds"] == 900
