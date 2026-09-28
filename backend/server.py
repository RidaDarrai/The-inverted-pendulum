"""FastAPI host for the RL visualizer (T9).

Serves the project root statically (``/`` answers ``rl-visualizer.html``),
exposes ``GET /api/health`` as a cheap liveness probe for the frontend, and
streams live training artifacts over ``WS /ws``:

* server → client ``{"type": "metrics" | "policy", "payload": <file json>}``
  whenever ``data/training_metrics.json`` / ``data/policy.json`` change on
  disk (mtime polled about once per second).
* client → server ``{"type": "set_agents" | "start" | "stop"}`` is a
  reserved protocol for future live training controls and always answers
  ``{"type": "error", "reason": "not_implemented"}``.

Run from ``backend/``: ``uv run uvicorn server:app --port 8000``.
"""
from __future__ import annotations

import asyncio
import json
from contextlib import suppress
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
WATCHED: dict[str, Path] = {
    "metrics": DATA_DIR / "training_metrics.json",
    "policy": DATA_DIR / "policy.json",
}
POLL_INTERVAL_SEC = 1.0
RESERVED_CONTROLS = frozenset({"set_agents", "start", "stop"})

app = FastAPI(title="rl-visualizer backend", version="0.1.0")


@app.get("/api/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok"})


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(REPO_ROOT / "rl-visualizer.html")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    send_lock = asyncio.Lock()
    mtimes = snapshot_mtimes()
    producer = asyncio.create_task(push_changes(websocket, send_lock, mtimes))
    consumer = asyncio.create_task(consume_controls(websocket, send_lock))
    tasks = {producer, consumer}
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for task in tasks:
            task.cancel()
        for task in tasks:
            with suppress(asyncio.CancelledError, Exception):
                await task


def snapshot_mtimes() -> dict[str, int | None]:
    mtimes: dict[str, int | None] = {}
    for kind, path in WATCHED.items():
        try:
            mtimes[kind] = path.stat().st_mtime_ns
        except OSError:
            mtimes[kind] = None
    return mtimes


def read_payload(path: Path) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


async def push_changes(
    websocket: WebSocket, lock: asyncio.Lock, mtimes: dict[str, int | None]
) -> None:
    while True:
        await asyncio.sleep(POLL_INTERVAL_SEC)
        for kind, path in WATCHED.items():
            try:
                current = path.stat().st_mtime_ns
            except OSError:
                continue
            if mtimes.get(kind) == current:
                continue
            payload = read_payload(path)
            if payload is None:
                continue
            mtimes[kind] = current
            message = json.dumps({"type": kind, "payload": payload}, ensure_ascii=False)
            async with lock:
                await websocket.send_text(message)


async def consume_controls(websocket: WebSocket, lock: asyncio.Lock) -> None:
    while True:
        raw = await websocket.receive_text()
        try:
            message = json.loads(raw)
        except ValueError:
            continue
        if not isinstance(message, dict) or message.get("type") not in RESERVED_CONTROLS:
            continue
        reply = json.dumps({"type": "error", "reason": "not_implemented"})
        async with lock:
            await websocket.send_text(reply)


app.mount("/", StaticFiles(directory=REPO_ROOT, html=True), name="static")
