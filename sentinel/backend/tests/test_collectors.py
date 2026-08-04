from pathlib import Path

import pytest

from collectors import (
    HostCollector,
    cpu_percent,
    network_rates,
    parse_cpu_stat,
    parse_meminfo,
    parse_mounts,
    parse_network,
    parse_os_release,
    parse_uptime,
)


FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_cpu_parsing_and_delta() -> None:
    previous = parse_cpu_stat(fixture("proc_stat.txt"))
    assert previous == (1020, 860)
    assert cpu_percent(previous, (1120, 900)) == 60.0
    assert cpu_percent(None, previous) is None
    with pytest.raises(ValueError):
        parse_cpu_stat("cpu broken")


def test_memory_and_swap_parsing() -> None:
    result = parse_meminfo(fixture("meminfo.txt"))
    assert result["totalBytes"] == 8_000_000 * 1024
    assert result["usedBytes"] == 5_000_000 * 1024
    assert result["percent"] == 62.5
    assert result["swapUsedBytes"] == 500_000 * 1024
    assert result["swapPercent"] == 25.0


def test_uptime_and_os_parsing() -> None:
    assert parse_uptime("9876.50 1234.0") == 9876.5
    assert parse_os_release(fixture("os-release"))["PRETTY_NAME"] == "Fixture Linux 1.0"
    with pytest.raises(ValueError):
        parse_uptime("-1 0")


def test_network_parsing_and_rates() -> None:
    current = parse_network(fixture("net_dev.txt"))
    assert set(current) == {"eth0", "wlan0"}
    previous = {"eth0": {"rxBytes": 1000, "txBytes": 2000}}
    result = network_rates((10.0, previous), 12.0, current)
    assert result["rxBytes"] == 6000
    assert result["txBytes"] == 9000
    assert result["rxBytesPerSecond"] == 2500
    assert result["txBytesPerSecond"] == 3500


def test_disk_filtering() -> None:
    mounts = parse_mounts("""
/dev/sda1 / ext4 rw 0 0
proc /proc proc rw 0 0
tmpfs /run tmpfs rw 0 0
/dev/sdb1 /srv/data xfs rw 0 0
/dev/sdb1 /srv/data xfs rw 0 0
overlay /var/lib/docker/overlay2 overlay rw 0 0
""")
    assert mounts == [("/", "ext4"), ("/srv/data", "xfs")]


def test_missing_and_malformed_host_files(tmp_path: Path) -> None:
    collector = HostCollector(tmp_path)
    with pytest.raises(FileNotFoundError):
        collector.memory()
    (tmp_path / "proc").mkdir()
    (tmp_path / "proc" / "meminfo").write_text("MemFree: nope", encoding="utf-8")
    with pytest.raises(ValueError):
        collector.memory()
