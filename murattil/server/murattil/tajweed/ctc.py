"""CTC algorithms used by the Tajweed coach: greedy decoding, Viterbi forced alignment against the
expected passage, and per-segment goodness-of-pronunciation scores."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

NEG = -1e30


def log_softmax(x: np.ndarray) -> np.ndarray:
    m = x.max(axis=-1, keepdims=True)
    return x - m - np.log(np.exp(x - m).sum(axis=-1, keepdims=True))


def greedy(logp: np.ndarray, blank: int) -> list[tuple[int, int, int]]:
    """Best-path decode. Returns [(token_id, first_frame, last_frame)]."""
    ids = logp.argmax(axis=1)
    out = []
    prev = -1
    for t, k in enumerate(ids):
        if k != blank and k != prev:
            out.append([int(k), t, t])
        elif k != blank and k == prev and out:
            out[-1][2] = t
        prev = k
    return [tuple(x) for x in out]


@dataclass
class TokenSpan:
    token: int
    start: int   # first frame (inclusive)
    end: int     # last frame (inclusive)
    logp: float  # mean log posterior of the token over its frames


def forced_align(logp: np.ndarray, targets: list[int], blank: int) -> tuple[list[TokenSpan], float]:
    """Viterbi alignment of `targets` to (T, V) log posteriors.
    Returns token spans and the path's mean log-probability per frame.
    Raises ValueError if the audio is too short for the target sequence."""
    T = logp.shape[0]
    L = len(targets)
    if L == 0:
        return [], 0.0
    S = 2 * L + 1
    ext = np.full(S, blank, dtype=np.int64)
    ext[1::2] = targets
    # minimum frames: each token needs a frame, repeated tokens need a blank in between
    need = L + sum(1 for i in range(1, L) if targets[i] == targets[i - 1])
    if need > T:
        raise ValueError("recording too short for the expected passage")
    emit = logp[:, ext]  # (T, S)
    dp = np.full(S, NEG)
    dp[0] = emit[0, 0]
    dp[1] = emit[0, 1]
    back = np.zeros((T, S), dtype=np.int8)  # 0 stay, 1 from s-1, 2 from s-2
    can_skip = np.zeros(S, dtype=bool)
    for s in range(2, S):
        can_skip[s] = ext[s] != blank and ext[s] != ext[s - 2]
    for t in range(1, T):
        stay = dp
        one = np.concatenate([[NEG], dp[:-1]])
        two = np.where(can_skip, np.concatenate([[NEG, NEG], dp[:-2]]), NEG)
        stacked = np.stack([stay, one, two])
        choice = stacked.argmax(axis=0)
        dp = stacked[choice, np.arange(S)] + emit[t]
        back[t] = choice
    s = int(S - 1 if dp[S - 1] >= dp[S - 2] else S - 2)
    total = dp[s]
    states = np.empty(T, dtype=np.int64)
    for t in range(T - 1, -1, -1):
        states[t] = s
        s -= int(back[t, s])
    spans: list[TokenSpan] = []
    for i in range(L):
        frames = np.flatnonzero(states == 2 * i + 1)
        if frames.size == 0:  # cannot happen for a valid path, but stay defensive
            spans.append(TokenSpan(targets[i], -1, -1, NEG))
            continue
        lp = float(logp[frames, targets[i]].mean())
        spans.append(TokenSpan(targets[i], int(frames[0]), int(frames[-1]), lp))
    return spans, float(total / T)


def segment_gop(logp: np.ndarray, start: int, end: int, forced_logp_sum: float) -> float:
    """Goodness of pronunciation for frames start..end: mean per-frame difference between the
    forced path and the unconstrained best frame label (<= 0; near 0 = matches what was expected)."""
    if end < start:
        return -10.0
    best = logp[start:end + 1].max(axis=1).sum()
    return float((forced_logp_sum - best) / (end - start + 1))


def forced_frame_logps(logp: np.ndarray, spans: list[TokenSpan], blank: int) -> np.ndarray:
    """Per-frame log prob of the forced path label (token inside spans, blank elsewhere)."""
    lab = np.full(logp.shape[0], blank, dtype=np.int64)
    for sp in spans:
        if sp.start >= 0:
            lab[sp.start:sp.end + 1] = sp.token
    return logp[np.arange(logp.shape[0]), lab]


def edit_ops(ref: list[str], hyp: list[str], sub_cost=None) -> list[tuple[str, int | None, int | None]]:
    """Word-level Levenshtein alignment. Returns ops (op, ref_index, hyp_index) with op in
    match/sub/del/ins. `sub_cost(a, b)` in [0, 1] lets near-misses substitute cheaply."""
    sub_cost = sub_cost or (lambda a, b: 0.0 if a == b else 1.0)
    n, m = len(ref), len(hyp)
    D = np.zeros((n + 1, m + 1))
    D[:, 0] = np.arange(n + 1)
    D[0, :] = np.arange(m + 1)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            D[i, j] = min(D[i - 1, j] + 1, D[i, j - 1] + 1, D[i - 1, j - 1] + sub_cost(ref[i - 1], hyp[j - 1]))
    ops = []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0 and np.isclose(D[i, j], D[i - 1, j - 1] + sub_cost(ref[i - 1], hyp[j - 1])):
            ops.append(("match" if ref[i - 1] == hyp[j - 1] else "sub", i - 1, j - 1))
            i, j = i - 1, j - 1
        elif i > 0 and np.isclose(D[i, j], D[i - 1, j] + 1):
            ops.append(("del", i - 1, None))
            i -= 1
        else:
            ops.append(("ins", None, j - 1))
            j -= 1
    return ops[::-1]


def char_similarity(a: str, b: str) -> float:
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    n, m = len(a), len(b)
    prev = list(range(m + 1))
    for i in range(1, n + 1):
        cur = [i] + [0] * m
        for j in range(1, m + 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] != b[j - 1]))
        prev = cur
    return 1.0 - prev[m] / max(n, m)
