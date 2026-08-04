from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from monitor import Monitor


monitor = Monitor()


@asynccontextmanager
async def lifespan(_: FastAPI):
    monitor.start()
    yield
    monitor.stop()


app = FastAPI(title="Automaton Sentinel", docs_url=None, redoc_url=None, lifespan=lifespan)


@app.get("/api/health")
def health() -> dict:
    snapshot = monitor.snapshot()
    return {
        "status": snapshot["status"],
        "sampledAt": snapshot["timestamp"],
        "warnings": snapshot["warnings"],
    }


@app.get("/api/snapshot")
def snapshot() -> dict:
    return monitor.snapshot()


@app.get("/api/history")
def history() -> dict:
    return {"intervalSeconds": 3, "retentionSeconds": 900, "points": monitor.history()}
