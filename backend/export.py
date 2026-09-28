"""Schema helpers shared by train.py and record.py — rl-contract.md §4."""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import torch.nn as nn

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
CHECKPOINTS_DIR = REPO_ROOT / "checkpoints"

SCHEMA_VERSION = 1
ENV_ID = "CartPole-v1"
ALGO = "PPO"
INPUT_LABELS = ["x", "ẋ", "θ", "θ̇"]
OUTPUT_LABELS = ["←", "→"]
ACTIVATION = "tanh"
OUTPUT = "softmax"
TARGET_EVAL_SCORE = 475.0

POLICY_PATH = DATA_DIR / "policy.json"
METRICS_PATH = DATA_DIR / "training_metrics.json"
EPISODES_PATH = DATA_DIR / "episodes.json"

POLICY_KEYS = {
    "schemaVersion", "env", "algo", "arch", "activation", "output", "W", "b",
    "inputLabels", "outputLabels", "trainTimesteps", "evalScore", "exportedAt",
}
METRICS_KEYS = {"schemaVersion", "solved", "generations"}
GENERATION_KEYS = {"gen", "timesteps", "best", "mean", "wallTime"}
EPISODE_KEYS = {"id", "label", "return", "length", "steps"}
STEP_KEYS = {"obs", "action", "probs", "reward", "terminated", "truncated", "activations"}


def _is_number(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value))
    )


def _float_list(value: Any) -> list[float]:
    if hasattr(value, "detach"):
        value = value.detach().cpu().numpy()
    return np.asarray(value, dtype=float).tolist()


def softmax(values: Any) -> list[float]:
    array = np.asarray(values, dtype=float)
    exp = np.exp(array - array.max())
    return (exp / exp.sum()).tolist()


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    with path.open(encoding="utf-8") as handle:
        json.load(handle)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def extract_layers(
    model: Any,
) -> tuple[list[int], list[list[list[float]]], list[list[float]]]:
    """Pull W/b out of an SB3 MlpPolicy (W[layer][to][from], contract §4)."""
    policy_net = model.policy.mlp_extractor.policy_net
    action_net = model.policy.action_net
    modules = list(policy_net.modules())[1:]
    linears = [module for module in modules if isinstance(module, nn.Linear)]
    others = [module for module in modules if not isinstance(module, nn.Linear)]
    assert linears, "policy_net contains no linear layers"
    assert others and all(isinstance(module, nn.Tanh) for module in others), (
        "expected tanh activations, got "
        + ", ".join(type(module).__name__ for module in others)
    )
    layers = linears + [action_net]
    dims = [layers[0].in_features] + [layer.out_features for layer in layers]
    weights = [_float_list(layer.weight) for layer in layers]
    biases = [_float_list(layer.bias) for layer in layers]
    return dims, weights, biases


def build_policy_json(
    model: Any, train_timesteps: int, eval_score: float
) -> dict[str, Any]:
    dims, weights, biases = extract_layers(model)
    payload: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "env": ENV_ID,
        "algo": ALGO,
        "arch": dims,
        "activation": ACTIVATION,
        "output": OUTPUT,
        "W": weights,
        "b": biases,
        "inputLabels": list(INPUT_LABELS),
        "outputLabels": list(OUTPUT_LABELS),
        "trainTimesteps": int(train_timesteps),
        "evalScore": float(eval_score),
        "exportedAt": now_iso(),
    }
    validate_policy_json(payload)
    return payload


def validate_policy_json(payload: dict[str, Any]) -> None:
    assert POLICY_KEYS <= set(payload), f"policy.json missing keys: {POLICY_KEYS - set(payload)}"
    assert payload["schemaVersion"] == SCHEMA_VERSION, "policy.json schemaVersion"
    assert payload["env"] == ENV_ID, "policy.json env"
    assert payload["algo"] == ALGO, "policy.json algo"
    arch = payload["arch"]
    assert isinstance(arch, list) and len(arch) >= 3, "policy.json arch"
    assert all(isinstance(dim, int) and not isinstance(dim, bool) and dim > 0 for dim in arch)
    assert arch[0] == 4 and arch[-1] == 2, f"policy.json arch ends: {arch}"
    weights, biases = payload["W"], payload["b"]
    assert len(weights) == len(biases) == len(arch) - 1, "policy.json W/b layer count"
    for index, (matrix, bias) in enumerate(zip(weights, biases)):
        assert len(matrix) == arch[index + 1], "policy.json W row count"
        assert len(bias) == arch[index + 1], "policy.json b length"
        for row in matrix:
            assert len(row) == arch[index], "policy.json W column count"
            assert all(_is_number(value) for value in row), "policy.json W values"
        assert all(_is_number(value) for value in bias), "policy.json b values"
    assert payload["activation"] == ACTIVATION, "policy.json activation"
    assert payload["output"] == OUTPUT, "policy.json output"
    assert payload["inputLabels"] == INPUT_LABELS, "policy.json inputLabels"
    assert payload["outputLabels"] == OUTPUT_LABELS, "policy.json outputLabels"
    assert isinstance(payload["trainTimesteps"], int) and payload["trainTimesteps"] >= 0
    assert _is_number(payload["evalScore"]) and payload["evalScore"] >= 0
    datetime.fromisoformat(payload["exportedAt"])


def validate_metrics_json(payload: dict[str, Any]) -> None:
    assert METRICS_KEYS <= set(payload), f"training_metrics.json missing keys: {METRICS_KEYS - set(payload)}"
    assert payload["schemaVersion"] == SCHEMA_VERSION, "training_metrics.json schemaVersion"
    assert isinstance(payload["solved"], bool), "training_metrics.json solved"
    generations = payload["generations"]
    assert isinstance(generations, list) and generations, "training_metrics.json generations"
    previous_gen = 0
    running_best = float("-inf")
    for generation in generations:
        assert GENERATION_KEYS <= set(generation), "training_metrics.json generation keys"
        assert generation["gen"] == previous_gen + 1, "generation counter must be 1..N"
        previous_gen = generation["gen"]
        assert isinstance(generation["timesteps"], int) and generation["timesteps"] > 0
        assert _is_number(generation["best"]) and _is_number(generation["mean"])
        assert _is_number(generation["wallTime"]) and generation["wallTime"] >= 0
        assert generation["best"] + 1e-6 >= generation["mean"], "best must be >= mean"
        assert generation["best"] + 1e-6 >= running_best, "best must be non-decreasing"
        running_best = max(running_best, float(generation["best"]))


def validate_episodes_json(payload: dict[str, Any], arch: list[int] | None = None) -> None:
    assert set(payload) >= {"schemaVersion", "episodes"}, "episodes.json keys"
    assert payload["schemaVersion"] == SCHEMA_VERSION, "episodes.json schemaVersion"
    episodes = payload["episodes"]
    assert isinstance(episodes, list) and episodes, "episodes.json episodes"
    for episode_index, episode in enumerate(episodes):
        assert EPISODE_KEYS <= set(episode), f"episode {episode_index} keys"
        assert episode["id"] == episode_index, "episode ids must be 0..N-1"
        assert isinstance(episode["label"], str) and episode["label"]
        assert _is_number(episode["return"])
        assert isinstance(episode["length"], int) and episode["length"] > 0
        steps = episode["steps"]
        assert isinstance(steps, list) and len(steps) == episode["length"], "episode length"
        total_reward = 0.0
        for step in steps:
            assert STEP_KEYS <= set(step), "step keys"
            obs = step["obs"]
            assert isinstance(obs, list) and len(obs) == 4 and all(_is_number(v) for v in obs)
            assert isinstance(step["action"], int) and step["action"] in (0, 1)
            probs = step["probs"]
            assert isinstance(probs, list) and len(probs) == 2
            assert all(0.0 <= float(v) <= 1.0 for v in probs), "probs range"
            assert abs(sum(float(v) for v in probs) - 1.0) < 1e-5, "probs sum"
            assert _is_number(step["reward"])
            assert isinstance(step["terminated"], bool)
            assert isinstance(step["truncated"], bool)
            activations = step["activations"]
            assert isinstance(activations, list) and len(activations) >= 2, "activations"
            expected = arch[1:] if arch is not None else [32, 32, 2]
            assert len(activations) == len(expected), "activations vs arch"
            for layer_activations, width in zip(activations, expected):
                assert len(layer_activations) == width, "activation width"
                assert all(_is_number(v) for v in layer_activations)
            assert abs(float(sum(activations[-1])) - 1.0) < 1e-5, "softmax activations"
            assert all(
                abs(float(a) - float(p)) < 1e-5 for a, p in zip(activations[-1], probs)
            ), "last activation layer must be the softmax probs"
            total_reward += float(step["reward"])
        assert abs(total_reward - float(episode["return"])) < 1e-6, "episode return"
        assert steps[-1]["terminated"] or steps[-1]["truncated"], "episode must end"


def load_policy_arch() -> list[int] | None:
    if not POLICY_PATH.exists():
        return None
    with POLICY_PATH.open(encoding="utf-8") as handle:
        policy = json.load(handle)
    validate_policy_json(policy)
    return policy["arch"]
