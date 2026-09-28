"""Record the best deterministic episode with per-step activations (§4)."""
from __future__ import annotations

from typing import Any

import gymnasium as gym
import numpy as np
import torch.nn as nn
from stable_baselines3 import PPO

from export import (
    CHECKPOINTS_DIR,
    EPISODES_PATH,
    ENV_ID,
    SCHEMA_VERSION,
    extract_layers,
    load_policy_arch,
    softmax,
    validate_episodes_json,
    write_json,
)

SEED = 1337
N_EPISODES = 10
SAFETY_MAX_STEPS = 10_000
CHECKPOINTS = ("ppo_cartpole_best.zip", "ppo_cartpole_latest.zip")


def load_model() -> PPO:
    for name in CHECKPOINTS:
        path = CHECKPOINTS_DIR / name
        if path.exists():
            print(f"loading checkpoint {path}", flush=True)
            return PPO.load(str(path), device="cpu")
    raise SystemExit(f"no checkpoint in {CHECKPOINTS_DIR} — run `uv run python train.py` first")


def attach_hooks(model: PPO) -> list[np.ndarray]:
    """Capture post-tanh hidden layers and the pre-softmax action logits."""
    captured: list[np.ndarray] = []

    def capture(_module: nn.Module, _inputs: Any, output: Any) -> None:
        captured.append(np.asarray(output.detach().cpu().squeeze(0), dtype=float))

    policy_net = model.policy.mlp_extractor.policy_net
    hooked = 0
    for module in policy_net:
        if isinstance(module, nn.Tanh):
            module.register_forward_hook(capture)
            hooked += 1
    assert hooked >= 1, "no tanh layers hooked in policy_net"
    model.policy.action_net.register_forward_hook(capture)
    return captured


def rollout(model: PPO, captured: list[np.ndarray], seed: int) -> dict[str, Any]:
    env = gym.make(ENV_ID)
    obs, _info = env.reset(seed=seed)
    steps: list[dict[str, Any]] = []
    terminated = truncated = False
    while not (terminated or truncated) and len(steps) < SAFETY_MAX_STEPS:
        captured.clear()
        action_array, _values = model.predict(np.asarray(obs, dtype=float), deterministic=True)
        assert len(captured) == 3, f"expected 3 hooked tensors, got {len(captured)}"
        hidden_a, hidden_b, logits = captured
        probs = softmax(logits)
        action = int(np.asarray(action_array).reshape(-1)[0])
        next_obs, reward, terminated, truncated, _info = env.step(action)
        steps.append(
            {
                "obs": [float(value) for value in np.asarray(obs, dtype=float).reshape(-1)],
                "action": action,
                "probs": probs,
                "reward": float(reward),
                "terminated": bool(terminated),
                "truncated": bool(truncated),
                "activations": [
                    [float(value) for value in hidden_a],
                    [float(value) for value in hidden_b],
                    probs,
                ],
            }
        )
        obs = next_obs
    env.close()
    return {
        "return": float(sum(step["reward"] for step in steps)),
        "length": len(steps),
        "steps": steps,
    }


def main() -> None:
    model = load_model()
    captured = attach_hooks(model)
    dims, _weights, _biases = extract_layers(model)
    arch = load_policy_arch() or dims

    best: dict[str, Any] | None = None
    for index in range(N_EPISODES):
        episode = rollout(model, captured, SEED + index)
        print(
            f"[episode {index}] seed={SEED + index} "
            f"return={episode['return']} length={episode['length']}",
            flush=True,
        )
        if best is None or episode["return"] > best["return"]:
            best = episode
    assert best is not None

    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "episodes": [
            {
                "id": 0,
                "label": "best-deterministic",
                "return": best["return"],
                "length": best["length"],
                "steps": best["steps"],
            }
        ],
    }
    validate_episodes_json(payload, arch=arch)
    write_json(EPISODES_PATH, payload)
    print(
        f"recorded episode 0 ({payload['episodes'][0]['label']}) "
        f"return={best['return']} length={best['length']} -> {EPISODES_PATH}",
        flush=True,
    )


if __name__ == "__main__":
    main()
