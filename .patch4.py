"""Четвёртый одноразовый патч scripts/cleanup_text.py.

Порядок колонок в двух кадровых матрицах сверен с исходным PDF по координатам
x: «Переменная часть (% или KPI)» стоит левее «Ключевые KPI». В расплющенных
OCR-блоках эти две колонки оказались переставлены.
"""

import pathlib
import sys

P = pathlib.Path("scripts/cleanup_text.py")
t = P.read_text(encoding="utf-8")


def rep(old, new, expect=1):
    global t
    n = t.count(old)
    if n != expect:
        sys.exit(f"FAIL: {n} != {expect} для {old[:80]!r}")
    t = t.replace(old, new)


rep(
    "def replace_picture_blocks(text: str) -> str:\n"
    '    """Заменяет 11 блоков <!-- Start of picture text --> на нормальные таблицы."""\n',
    "# В исходном PDF порядок колонок кадровой матрицы — «Переменная часть\n"
    "# (% или KPI)», затем «Ключевые KPI» (сверено по координатам x в PDF).\n"
    "# В двух расплющенных OCR-блоках эти колонки оказались переставлены.\n"
    "MATRIX_BLOCKS = {0, 10}\n"
    "\n"
    "\n"
    "def swap_matrix_columns(table: str) -> str:\n"
    '    """Меняет местами колонки 5 и 6 в таблице кадровой матрицы."""\n'
    "    out: list[str] = []\n"
    '    for line in table.split("\\n"):\n'
    "        cells = split_row(line)\n"
    "        if len(cells) == 7 and not is_separator(cells):\n"
    "            cells[4], cells[5] = cells[5], cells[4]\n"
    '            out.append("|" + "|".join(cells) + "|")\n'
    "        else:\n"
    "            out.append(line)\n"
    '    return "\\n".join(out)\n'
    "\n"
    "\n"
    "def replace_picture_blocks(text: str) -> str:\n"
    '    """Заменяет 11 блоков <!-- Start of picture text --> на нормальные таблицы."""\n',
)

rep(
    "    it = iter(PICTURE_TABLES)\n"
    "    return pattern.sub(lambda _m: next(it), text)\n",
    "    it = iter(PICTURE_TABLES)\n"
    "    seen = 0\n"
    "\n"
    "    def repl(_m: re.Match) -> str:\n"
    "        nonlocal seen\n"
    "        table = next(it)\n"
    "        idx = seen\n"
    "        seen += 1\n"
    "        return swap_matrix_columns(table) if idx in MATRIX_BLOCKS else table\n"
    "\n"
    "    return pattern.sub(repl, text)\n",
)

if t.count("\ufffd"):
    sys.exit("FAIL: в скрипте U+FFFD")
P.write_text(t, encoding="utf-8")
print("Патч 4 применён. Строк:", len(t.split("\n")))
