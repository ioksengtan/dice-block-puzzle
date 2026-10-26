#!/usr/bin/env python3
"""Offline check: every 6^7 dice roll of 骰陣拼圖 is solvable.

This script is not used by the game. It places the nine pieces
(monomino, domino, straight tromino, L tromino, and the straight,
square, T, S, and L tetrominoes, including rotations and reflections)
onto each blocked board and stops at the first solution.

Die faces (rows A–F top to bottom, columns 1–6 left to right). Each of
the 36 cells appears on exactly one die. Two dice repeat faces, so
there are 6**7 rolls and 62,208 distinct boards. Faces are the physical
dice recorded after correction by ManGo's Gaming, matching
mitchblank/gsqsolve (that file cites the same list):

https://mangosgaming.uk/portfolio/review-genius-square/
https://github.com/mitchblank/gsqsolve/blob/main/gsqsolve.cpp
https://www.reddit.com/r/boardgames/comments/kxt1q3/comment/gjc5m2n/
"""

from __future__ import annotations

import itertools
import sys
import time

ROWS = COLS = 6
FULL = (1 << (ROWS * COLS)) - 1

# Keep in sync with site/daily.js. Order is 第一顆 through 第七顆.
DICE = (
    ("A1", "C1", "D1", "D2", "E2", "F3"),
    ("A2", "B2", "C2", "A3", "B1", "B3"),
    ("C3", "D3", "E3", "B4", "C4", "D4"),
    ("E1", "F2", "F2", "B6", "A5", "A5"),
    ("A4", "B5", "C6", "C5", "D6", "F6"),
    ("E4", "F4", "E5", "F5", "D5", "E6"),
    ("F1", "F1", "F1", "A6", "A6", "A6"),
)

SHAPES = (
    ("方形四格方塊", ((0, 0), (0, 1), (1, 0), (1, 1))),
    ("直線四格方塊", ((0, 0), (0, 1), (0, 2), (0, 3))),
    ("之字形四格方塊", ((0, 1), (0, 2), (1, 0), (1, 1))),
    ("丁字形四格方塊", ((0, 0), (0, 1), (0, 2), (1, 1))),
    ("長角形四格方塊", ((0, 0), (1, 0), (2, 0), (2, 1))),
    ("直線三格方塊", ((0, 0), (0, 1), (0, 2))),
    ("角形三格方塊", ((0, 0), (1, 0), (1, 1))),
    ("雙格方塊", ((0, 0), (0, 1))),
    ("單格方塊", ((0, 0),)),
)


def coord_bit(coord: str) -> int:
    row = ord(coord[0]) - ord("A")
    col = int(coord[1]) - 1
    if not (0 <= row < ROWS and 0 <= col < COLS) or len(coord) != 2:
        raise ValueError(coord)
    return 1 << (row * COLS + col)


def normalize(cells: tuple[tuple[int, int], ...] | list[tuple[int, int]]) -> tuple[tuple[int, int], ...]:
    min_r = min(r for r, _ in cells)
    min_c = min(c for _, c in cells)
    return tuple(sorted((r - min_r, c - min_c) for r, c in cells))


def variants(cells: tuple[tuple[int, int], ...]) -> list[tuple[tuple[int, int], ...]]:
    seen: set[tuple[tuple[int, int], ...]] = set()
    current = list(cells)
    found: list[tuple[tuple[int, int], ...]] = []
    for _ in range(4):
        for shape in (current, [(r, -c) for r, c in current]):
            norm = normalize(shape)
            if norm not in seen:
                seen.add(norm)
                found.append(norm)
        current = [(c, -r) for r, c in current]
    return found


def placements_by_cell(cells: tuple[tuple[int, int], ...]) -> list[tuple[int, ...]]:
    per_cell: list[list[int]] = [[] for _ in range(ROWS * COLS)]
    for shape in variants(cells):
        height = max(r for r, _ in shape) + 1
        width = max(c for _, c in shape) + 1
        for row0 in range(ROWS - height + 1):
            for col0 in range(COLS - width + 1):
                mask = 0
                for row, col in shape:
                    mask |= 1 << ((row0 + row) * COLS + (col0 + col))
                bit = mask
                while bit:
                    lowest = bit & -bit
                    per_cell[lowest.bit_length() - 1].append(mask)
                    bit ^= lowest
    return [tuple(dict.fromkeys(masks)) for masks in per_cell]


PIECES = [placements_by_cell(cells) for _, cells in SHAPES]


def solve(occupied: int, remaining: int) -> bool:
    """Exact cover. `remaining` is a bitset of unused piece indexes."""
    if remaining == 0:
        return ((~occupied) & FULL) == 0
    empty = (~occupied) & FULL
    cell = (empty & -empty).bit_length() - 1
    bits = remaining
    while bits:
        bit = bits & -bits
        bits ^= bit
        index = bit.bit_length() - 1
        for mask in PIECES[index][cell]:
            if mask & occupied == 0 and solve(occupied | mask, remaining ^ bit):
                return True
    return False


def check_partition() -> None:
    seen: dict[str, int] = {}
    for die_index, faces in enumerate(DICE):
        if len(faces) != 6:
            raise SystemExit(f"第 {die_index + 1} 顆骰子不是六面")
        for face in faces:
            previous = seen.get(face)
            if previous is not None and previous != die_index:
                raise SystemExit(f"{face} 同時出現在第 {previous + 1} 顆與第 {die_index + 1} 顆")
            seen[face] = die_index
    expected = {f"{chr(ord('A') + row)}{col + 1}" for row in range(6) for col in range(6)}
    if set(seen) != expected:
        raise SystemExit(f"骰面沒有覆蓋每一格：{sorted(expected - set(seen))}")
    covered = sum(len(cells) for _, cells in SHAPES)
    if covered != 29:
        raise SystemExit(f"九塊拼圖共 {covered} 格，應為 29 格")


def main() -> int:
    check_partition()
    cache: dict[int, bool] = {}
    failures: list[tuple[str, ...]] = []
    checked = 0
    started = time.perf_counter()
    for roll in itertools.product(*DICE):
        checked += 1
        mask = 0
        for face in roll:
            mask |= coord_bit(face)
        solvable = cache.get(mask)
        if solvable is None:
            solvable = solve(mask, (1 << len(SHAPES)) - 1)
            cache[mask] = solvable
        if not solvable:
            failures.append(roll)
    elapsed = time.perf_counter() - started

    print(f"已枚舉 {checked} 組骰面（6^7 = {6**7}）。")
    print(f"相異阻擋棋盤 {len(cache)} 個。")
    print(f"可解 {checked - len(failures)} 組，無解 {len(failures)} 組。")
    print(f"耗時 {elapsed:.2f} 秒。")
    if failures:
        print("無解的骰面座標：")
        for roll in failures:
            print(" ".join(f"第{i + 1}顆{face}" for i, face in enumerate(roll)))
        print("結果：有骰子組合無解。")
        return 1
    print("結果：每一組骰子組合都有解。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
