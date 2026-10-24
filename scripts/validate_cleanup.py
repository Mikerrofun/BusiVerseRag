#!/usr/bin/env python3
"""План 2, раздел 7: валидатор результата очистки.

Проверяет ожидания из плана и печатает отчёт. Ничего не меняет.
Запуск: python3 scripts/validate_cleanup.py
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DOC = ROOT / "RAG-документация_BusiVerse.md"

NICHE_HEADINGS = [
    "## 1. ОФЛАЙН",
    "## 2. ОФЛАЙН",
    "## 3. ОФЛАЙН",
    "## 4. ОФЛАЙН",
    "## 5. ОФЛАЙН",
    "## 6. ОНЛАЙН",
    "## 7. ОНЛАЙН",
    "## 8. ОНЛАЙН",
    "## 9. ОНЛАЙН",
    "## 10. ОНЛАЙН",
]


def split_row(line: str) -> list[str]:
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


def is_separator(cells: list[str]) -> bool:
    return all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c != "")


def main() -> None:
    text = DOC.read_text(encoding="utf-8")
    lines = text.split("\n")

    problems: list[str] = []

    def check(label: str, value, expected: str, ok: bool) -> None:
        mark = "OK  " if ok else "FAIL"
        print(f"[{mark}] {label}: {value} (ожидалось {expected})")
        if not ok:
            problems.append(label)

    # 1. HTML-разметка
    for tag in ("<br>", "<br/>", "<br />", "<u>", "</u>", "<mark>", "</mark>"):
        n = text.count(tag)
        check(f"тег {tag}", n, "0", n == 0)

    # 2. Хвостовые пробелы
    trailing = sum(1 for l in lines if l != l.rstrip())
    check("хвостовые пробелы", trailing, "0", trailing == 0)

    # 3. Тройные пустые строки
    triples = len(re.findall(r"\n{3,}", text))
    check("тройные пустые строки", triples, "0", triples == 0)

    # 4. Таблицы: число, расхождение колонок, пустая первая ячейка
    tables = 0
    col_mismatch = 0
    empty_first = 0
    empty_first_lines: list[int] = []
    glued_blocks = 0
    i = 0
    while i < len(lines):
        if not lines[i].startswith("|"):
            i += 1
            continue
        j = i
        while j < len(lines) and lines[j].startswith("|"):
            j += 1
        block = lines[i:j]
        # Таблица = блок, где есть строка-разделитель. Каждый разделитель —
        # начало отдельной таблицы, поэтому их число и есть число таблиц.
        sep_idx = [k for k, l in enumerate(block) if is_separator(split_row(l))]
        if sep_idx:
            tables += len(sep_idx)
            if len(sep_idx) > 1:
                glued_blocks += 1
            ncol = len(split_row(block[sep_idx[0]]))
            for k, l in enumerate(block):
                if k in sep_idx:
                    continue
                cells = split_row(l)
                if len(cells) != ncol:
                    col_mismatch += 1
                if k > sep_idx[0] and cells and cells[0] == "":
                    empty_first += 1
                    empty_first_lines.append(i + k + 1)
        i = j

    # 336 таблиц в исходнике + 11 восстановленных OCR-блоков = 347.
    check("число таблиц", tables, "347", tables == 347)
    check("склеенные таблицы (2 разделителя в блоке)", glued_blocks, "0", glued_blocks == 0)
    check("строки с расхождением колонок", col_mismatch, "0", col_mismatch == 0)
    check("строки с пустой первой ячейкой", empty_first, "<= 20", empty_first <= 20)

    # 5. Точечные дефекты
    check("'разделB0'", text.count("разделB0"), "0", text.count("разделB0") == 0)
    check(
        "заголовок '9:41 Store' без кавычек",
        len(re.findall(r"^## 9:41 Store", text, re.M)),
        "0",
        len(re.findall(r"^## 9:41 Store", text, re.M)) == 0,
    )

    # 6. Структура
    h2 = len(re.findall(r"^## ", text, re.M))
    check("заголовки H2", h2, "287", h2 == 287)

    niches = sum(1 for h in NICHE_HEADINGS if h in text)
    check("ниши", niches, "10", niches == 10)

    # Подразделы N.M внутри каждой ниши
    sub_re = re.compile(r"^## (\d+)\.(\d+)\.", re.M)
    per_niche: dict[int, set[int]] = {}
    for m in sub_re.finditer(text):
        per_niche.setdefault(int(m.group(1)), set()).add(int(m.group(2)))
    counts = {k: len(v) for k, v in sorted(per_niche.items())}
    print(f"       подразделы по нишам: {counts}")
    bad = {k: v for k, v in counts.items() if v != 8}
    check("подразделов в каждой нише", bad or "8 у всех", "8", not bad)

    # 7. Дрейф заголовков
    check(
        "'Закрытия в первые 6–12 месяцев работы'",
        text.count("## Закрытия в первые 6–12 месяцев работы"),
        "0",
        text.count("## Закрытия в первые 6–12 месяцев работы") == 0,
    )
    check(
        "'Чек-лист сотрудника на день'",
        text.count("## Чек-лист сотрудника на день"),
        "0",
        text.count("## Чек-лист сотрудника на день") == 0,
    )

    print()
    if empty_first_lines:
        print(f"Строки с пустой первой ячейкой ({len(empty_first_lines)}):")
        print("  " + ", ".join(str(n) for n in empty_first_lines))
        print()

    if problems:
        print(f"ПРОБЛЕМЫ ({len(problems)}): " + "; ".join(problems))
        sys.exit(1)
    print("Все проверки пройдены.")


if __name__ == "__main__":
    main()
