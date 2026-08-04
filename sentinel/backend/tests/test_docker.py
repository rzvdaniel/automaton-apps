from docker_client import calculate_cpu_percent, sanitize_container


def test_docker_response_is_sanitized() -> None:
    raw = {
        "Id": "a" * 64,
        "Names": ["/web"],
        "Image": "registry/private:latest",
        "State": "running",
        "Status": "Up 3 hours (healthy)",
        "Env": ["PASSWORD=secret"],
        "Labels": {"token": "secret"},
        "Mounts": [{"Source": "/private"}],
        "Command": "secret-command",
        "NetworkSettings": {"IPAddress": "10.0.0.1"},
    }
    stats = {
        "cpu_stats": {"cpu_usage": {"total_usage": 400}, "system_cpu_usage": 2000, "online_cpus": 2},
        "precpu_stats": {"cpu_usage": {"total_usage": 300}, "system_cpu_usage": 1000},
        "memory_stats": {"usage": 500, "limit": 1000, "stats": {"cache": 100}},
    }
    result = sanitize_container(raw, stats, {"State": {"Health": {"Status": "healthy"}}, "RestartCount": 2, "Config": {"Env": ["SECRET"]}})
    assert result == {
        "id": "aaaaaaaaaaaa", "name": "web", "image": "registry/private:latest",
        "state": "running", "status": "Up 3 hours (healthy)", "health": "healthy",
        "cpuPercent": 20.0, "memoryUsageBytes": 400, "memoryPercent": 40.0, "restartCount": 2,
    }
    serialized = str(result)
    for forbidden in ("PASSWORD", "Labels", "Mounts", "Command", "IPAddress", "Config", "SECRET"):
        assert forbidden not in serialized


def test_cpu_percent_handles_missing_stats() -> None:
    assert calculate_cpu_percent({}) is None
