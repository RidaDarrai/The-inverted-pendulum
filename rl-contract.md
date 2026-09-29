# RL Visualizer — Engineering Contract

Single source of truth for every RL task in this repo. Task prompts say "read this
file first" — never re-derive schemas, design rules, or module APIs from scratch.

## 1. Scope & protected files

Work only inside `The inverted pendulum/`.

NEVER modify: `inverted-pendulum.css`, `inverted-pendulum.js`, `index.html`,
`media/`, `LICENSE`. `README.md` is owned by T10 only.
`inverted-pendulum.html` — single exception: one link
`<a href="rl-visualizer.html">rl visualizer</a>` inside `#bottom-text` (T1 only).

Everything else is a new file. Never edit files owned by another task (§9).

## 2. Design DNA (match existing page exactly)

- Font: `'Spartan', sans-serif` (Google Fonts link in page head)
- Page bg `AliceBlue`; `#container` width 45rem, scaled by `fitContainerToScreen()`
- Frame = `.control-frame` > `.frame-content`: bg `rgba(255,255,255,0.65)`,
  border `0.25rem solid #DDECFB`, radius `1.5rem`,
  shadow `0 0.4rem 1.2rem rgba(99,135,167,0.15)`, `margin-bottom: 1.5rem`,
  min 18rem × 5rem
- Every frame ships `.resize-handle` (bottom-right, scales content) and, where
  edge resize makes sense, four `.border-resize[data-edge]` divs
- Accents: `#8CBCE5` primary · `#6387A7` dark/pressed · `#7ea9ce` hover ·
  `#DDECFB` light · buttons: bg `#8CBCE5`, white text, border `0.25rem`, radius `0.7rem`
- Type scale: title 3.5rem · body p 1.4rem · buttons 1.2rem · labels/numbers 1rem
- Charts & badges use the blue palette ONLY (line `#6387A7`/`#8CBCE5`,
  area fill `rgba(140,188,229,0.35)`, grid `rgba(99,135,167,0.15)`) — no dark theme
- Badge = mini `.control-frame`: auto width, `padding: 0.6rem 1.2rem`,
  caption 0.8rem uppercase letterspaced, value 1.6rem bold

## 3. Page skeleton — owner T1 (no one else edits these two files)

`rl-visualizer.html`: same `<head>` as `inverted-pendulum.html` + `rl-visualizer.css`
+ scripts in order: `js/vendor/d3.min.js`, `js/panels.js`, `js/cartpole.js`,
`js/policy.js`, `js/stage.js`, `js/nn-viz.js`, `js/charts.js`, `js/sources.js`,
`js/player.js`, `js/ws.js`, `js/app.js`

DOM ids later tasks wire:

- badges: `#badge-row` → `#badge-status` (`#status-mode`, `#status-speed`),
  `#badge-training` (`#training-gen`, `#training-best`),
  `#badge-pop` (`#pop-alive`, `#pop-mean`)
- `#scene-frame`: SVG `#stage-svg` (pendulum scene copy, viewBox `-135 -40 270 50`),
  `#ruler` (ticks −2.4 … 2.4 m), `#ghost-canvas` (absolute overlay)
- `#controls-frame`: `#mode-toggle` (`.mode-btn[data-mode=replay|live]`),
  `#agents-slider` (0..10 → index into `AGENT_PRESETS`), `#agents-input` (1..1000),
  `#speed-slider` (0..9 → index into `SPEED_PRESETS`), `#speed-label`,
  `#play-pause`, `#rl-reset`, `#stochastic-toggle`, `#ghosts-toggle`,
  `#episode-select`, `#scrubber`, `#step-readout`
- `#nn-frame` → `#nn-container` · `#telemetry-frame` → `#telemetry-container` ·
  `#score-frame` → `#score-container`
- `#data-notice` → `#data-notice-text`: fixed-overlay error banner shown when
  `data/*.json` cannot load (e.g. `file://` blocks `fetch`). Lives under
  `#background`, **never** under `#container` — `freezePanelRows()` maps every
  container child to a grid track, so a hidden child desyncs the layout.

T1 ships no-op stubs (correct exports, empty bodies) for every `js/*.js` module so
the page runs with zero console errors before other tasks land.

## 4. JSON data contract — `data/` (git-tracked; T8 rewrites)

`data/policy.json`
```json
{ "schemaVersion": 1, "env": "CartPole-v1", "algo": "PPO", "arch": [4,32,32,2],
  "activation": "tanh", "output": "softmax",
  "W": "3 matrices: W[layer][to][from], nested arrays",
  "b": "3 bias vectors",
  "inputLabels": ["x","ẋ","θ","θ̇"], "outputLabels": ["←","→"],
  "trainTimesteps": 0, "evalScore": 0, "exportedAt": "ISO-8601" }
```

`data/training_metrics.json`
```json
{ "schemaVersion": 1, "solved": false,
  "generations": [ {"gen":1,"timesteps":1000,"best":22.0,"mean":19.4,"wallTime":1.2} ] }
```

`data/episodes.json`
```json
{ "schemaVersion": 1,
  "episodes": [ { "id":0, "label":"best-deterministic", "return":500.0, "length":500,
    "steps": [ { "obs":[0.01,0.0,0.02,0.0], "action":0, "probs":[0.7,0.3], "reward":1.0,
      "terminated": false, "truncated": false,
      "activations": [[32],[32],[2]] } ] } ] }
```
`activations` = post-tanh hidden layers + softmax output (required in recordings;
live mode computes its own).

Fixtures: T2 generates synthetic versions of all three via `dev/make-fixtures.js`.
T8 overwrites with real training output — schema identical, zero frontend changes.

## 5. CartPole-v1 exact JS port — owner T2

Policy is trained on Gymnasium `CartPole-v1`; JS must match equation-for-equation.

```
gravity=9.8  masscart=1.0  masspole=0.1  length=0.5 (HALF-pole)
force_mag=10.0  tau=0.02  theta_threshold=0.20943951 (12°)  x_threshold=2.4
total_mass=1.1  polemass_length=0.05

step(state, action):   action 0 → force −10, 1 → +10
  costheta=cos(th); sintheta=sin(th)
  temp  = (force + polemass_length * th_dot^2 * sintheta) / total_mass
  thacc = (gravity*sintheta - costheta*temp)
        / (length * (4/3 - masspole*costheta^2/total_mass))
  xacc  = temp - polemass_length*thacc*costheta/total_mass
  Euler: x += tau*x_dot;  x_dot += tau*xacc;
         th += tau*th_dot; th_dot += tau*thacc
  reward = 1
  terminated = |x| > 2.4 or |th| > theta_threshold
  truncated  = episodeSteps >= 500

reset(seed?): state ~ U[-0.05, 0.05]^4 (seedable LCG), episodeSteps = 0
```

Render map: `x ∈ [−2.4, 2.4]` → viewBox rail `x ∈ [−130, 130]`;
θ = 0 is upright, screen rotation = θ (rad → deg).

## 6. Module API — `window.RL`, classic scripts, dual-export footer

```js
if (typeof window !== "undefined") (window.RL ||= {}).<name> = <name>;
if (typeof module !== "undefined") module.exports = { <name> };
```
(node `require()` for unit tests; no package.json → CJS default)

- `RL.cartpole` — `reset(seed?) → Float64Array(4)`,
  `step(state, 0|1) → {state, reward, terminated, truncated}`, `CONST`
- `RL.policy` — `fromJSON(policyJson) → model`;
  `model.forward(obs4, {stochastic, rng}) → {action, probs:[2], activations:[[32],[32],[2]]}`
- `RL.stage` — `init()`, `setAgents(obsFloat32N, dones)`, `setHero(obs4)`,
  `setGhostTrails(bool)`
- `RL.nnviz` — `init()`, `setPolicy(policyJson)`,
  `update(obs4, {action, probs, activations})`
- `RL.charts` — `initScore()`, `initTelemetry()`,
  `pushScore({x, best, mean})`, `pushTelemetry({t, speed, theta})`, `reset()`
- `RL.sources` — factories return
  `source = { start(cfg), tick(dtSec) → batch|null, info(), stop() }`
  with `cfg = {agents, stochastic, episodeId}` and
  `batch = { n, obs:Float32Array(n*4), actions:Uint8Array(n), dones:Uint8Array(n),
             heroIndex, hero:{obs,action,probs,activations}|null,
             globalStep, simTime, episodeProgress,
             population:{alive, meanReturn, bestReturn} }`
  Implementations: `ReplaySource(episodesJson)`, `LocalSource(policyJson, cartpole)`
- `RL.player` — `init()`, `setMode('replay'|'live')`, `setAgents(n)`,
  `setSpeed(presetIndex)`, `play()`, `pause()`, `reset()`, `seek(frac)`,
  `onBatch(cb)`
- `RL.ws` (owner T9) — connects to backend if served; on change dispatches
  `window` CustomEvents `rl:metrics` (training_metrics.json shape) and
  `rl:policy` (policy.json shape). Offline → silent no-op (static JSON path).
  T7's `app.js` subscribes to both from the start.

```js
SPEED_PRESETS = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, "MAX"]  // steps/s = 50 × mult
AGENT_PRESETS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1000]
```

## 7. Performance budgets

- 60 fps at 1000 agents: physics + inference batched per frame
- Ghost trail ring-buffer samples by N: N≤32 → 64 · N≤256 → 16 · else → 6
- `MAX`: step within an 8 ms/frame budget; badge shows measured steps/s (`FULL SPEED`)
- Hero activations computed for `heroIndex` only
- Live: failed agent fades out + respawns randomized (swarm keeps flowing);
  Replay: episode loops at end

## 8. Git workflow & commits

- Branch per task from `master`: `git checkout -b feat/<slug>`
  (types: `feat` `fix` `chore` `docs` `refactor`)
- Conventional Commits with scope: `feat(nn-viz): activation glow on nodes`
- Small commits, explicit `git add <file>` (never blind `git add .`)
- Done & verified → `git checkout master && git merge feat/<slug>` (fast-forward)
- Review any session's work cheaply: `git diff master...<branch>` — do not re-read files
- Never commit: `.venv/`, `__pycache__/`, `checkpoints/*.zip` (see `.gitignore`);
  DO commit `data/*.json` (page needs them offline)

## 9. Ownership map

| files | task |
|---|---|
| `.gitignore`, `rl-contract.md` | T0 ✅ |
| `rl-visualizer.html/.css`, `js/panels.js`, `js/vendor/d3.min.js`, stubs, link | T1 |
| `js/cartpole.js`, `js/policy.js`, `dev/make-fixtures.js`, `test/`, `data/*` fixtures | T2 |
| `js/stage.js`, `dev/stage-preview.html` | T3 |
| `js/nn-viz.js`, `dev/nn-preview.html` | T4 |
| `js/charts.js`, `dev/charts-preview.html` | T5 |
| `js/player.js`, `js/sources.js`, `dev/player-preview.html` | T6 |
| `js/app.js`, css touch-ups, html hook fixes | T7 |
| `backend/` (pyproject, train, export, record) | T8 |
| `backend/server.py`, `js/ws.js` + WS protocol | T9 |
| `README.md`, final end-to-end verification | T10 |
