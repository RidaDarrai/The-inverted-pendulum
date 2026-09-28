"""PPO training on CartPole-v1: periodic eval, metrics + policy export (§4)."""
from __future__ import annotations

import time
from multiprocessing import cpu_count
from typing import Any

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.evaluation import evaluate_policy
from stable_baselines3.common.vec_env import VecEnv

from export import (
    CHECKPOINTS_DIR,
    DATA_DIR,
    ENV_ID,
    METRICS_PATH,
    POLICY_PATH,
    SCHEMA_VERSION,
    TARGET_EVAL_SCORE,
    build_policy_json,
    validate_metrics_json,
    validate_policy_json,
    write_json,
)

N_ENVS = max(1, min(8, cpu_count()))
NET_ARCH = [32, 32]
EVAL_INTERVAL = 10_000
N_EVAL_EPISODES = 10
MAX_TIMESTEPS = 300_000
N_STEPS = 512
BATCH_SIZE = 256
SEED = 1337
LATEST_CHECKPOINT = "ppo_cartpole_latest"
BEST_CHECKPOINT = "ppo_cartpole_best"


class TrainingLog:
    """Periodic evaluation records + contract output files."""

    def __init__(self) -> None:
        self.generations: list[dict[str, Any]] = []
        self.best = 0.0
        self.last_eval_timesteps = 0
        self.started = time.monotonic()

    @property
    def gen(self) -> int:
        return len(self.generations)

    def evaluate(self, model: PPO, eval_env: VecEnv) -> float:
        mean_reward, std_reward = evaluate_policy(
            model,
            eval_env,
            n_eval_episodes=N_EVAL_EPISODES,
            deterministic=True,
            warn=False,
        )
        mean_reward = float(mean_reward)
        improved = mean_reward > self.best
        self.best = max(self.best, mean_reward)
        self.generations.append(
            {
                "gen": self.gen + 1,
                "timesteps": int(model.num_timesteps),
                "best": round(self.best, 2),
                "mean": round(mean_reward, 2),
                "wallTime": round(time.monotonic() - self.started, 2),
            }
        )
        self.last_eval_timesteps = int(model.num_timesteps)

        metrics = {
            "schemaVersion": SCHEMA_VERSION,
            "solved": bool(self.best >= TARGET_EVAL_SCORE),
            "generations": self.generations,
        }
        write_json(METRICS_PATH, metrics)
        validate_metrics_json(metrics)

        policy = build_policy_json(model, self.last_eval_timesteps, mean_reward)
        write_json(POLICY_PATH, policy)
        validate_policy_json(policy)

        model.save(str(CHECKPOINTS_DIR / LATEST_CHECKPOINT))
        if improved:
            model.save(str(CHECKPOINTS_DIR / BEST_CHECKPOINT))

        record = self.generations[-1]
        print(
            f"[gen {record['gen']:>2}] steps={record['timesteps']:<7} "
            f"mean={record['mean']:<6} best={record['best']:<6} "
            f"std={std_reward:.2f} wall={record['wallTime']}s "
            f"-> {POLICY_PATH.name}",
            flush=True,
        )
        return mean_reward


class PeriodicEvalCallback(BaseCallback):
    def __init__(self, log: TrainingLog, eval_env: VecEnv) -> None:
        super().__init__()
        self.log = log
        self.eval_env = eval_env

    def _on_step(self) -> bool:
        if (
            self.num_timesteps - self.log.last_eval_timesteps < EVAL_INTERVAL
            and self.num_timesteps < MAX_TIMESTEPS
        ):
            return True
        self.log.evaluate(self.model, self.eval_env)
        if self.log.best >= TARGET_EVAL_SCORE:
            return False
        return self.num_timesteps < MAX_TIMESTEPS


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)

    train_env = make_vec_env(ENV_ID, n_envs=N_ENVS, seed=SEED)
    eval_env = make_vec_env(ENV_ID, n_envs=1, seed=SEED + 1000)
    model = PPO(
        "MlpPolicy",
        train_env,
        n_steps=N_STEPS,
        batch_size=BATCH_SIZE,
        policy_kwargs={"net_arch": NET_ARCH},
        seed=SEED,
        verbose=0,
    )

    log = TrainingLog()
    print(
        f"PPO {ENV_ID} arch={NET_ARCH} envs={N_ENVS} "
        f"eval every {EVAL_INTERVAL} steps, target {TARGET_EVAL_SCORE:.0f}",
        flush=True,
    )
    model.learn(total_timesteps=MAX_TIMESTEPS, callback=PeriodicEvalCallback(log, eval_env))
    if log.last_eval_timesteps < int(model.num_timesteps):
        log.evaluate(model, eval_env)

    train_env.close()
    eval_env.close()

    status = "reached" if log.best >= TARGET_EVAL_SCORE else "NOT reached"
    print(
        f"training done: generations={log.gen} best={log.best} "
        f"target={TARGET_EVAL_SCORE:.0f} -> {status}",
        flush=True,
    )


if __name__ == "__main__":
    main()
