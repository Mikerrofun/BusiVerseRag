"""Минимальный извлекатель текста из PDF: нужен, чтобы сверить порядок
колонок в двух таблицах с исходным PDF. Не часть пайплайна очистки.
"""

import pathlib
import re
import sys
import zlib

PDF = pathlib.Path("/tmp/src.pdf")
b = PDF.read_bytes()

# --- объекты ---------------------------------------------------------------
objs: dict[int, bytes] = {}
for m in re.finditer(rb"(?<![0-9])(\d+)\s+0\s+obj\b", b):
    num = int(m.group(1))
    end = b.find(b"endobj", m.end())
    if end < 0:
        continue
    objs[num] = b[m.end() : end]


def stream_of(body: bytes) -> bytes | None:
    m = re.search(rb"stream\r?\n", body)
    if not m:
        return None
    e = body.rfind(b"endstream")
    if e < 0:
        return None
    raw = body[m.end() : e]
    if b"/FlateDecode" in body[: m.start()]:
        try:
            return zlib.decompress(raw)
        except zlib.error:
            try:
                return zlib.decompressobj().decompress(raw)
            except zlib.error:
                return None
    return raw


# --- ToUnicode -------------------------------------------------------------
def parse_cmap(data: bytes) -> dict[int, str]:
    txt = data.decode("latin-1")
    out: dict[int, str] = {}
    for blk in re.findall(r"beginbfchar(.*?)endbfchar", txt, re.S):
        for a, c in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", blk):
            out[int(a, 16)] = bytes.fromhex(c).decode("utf-16-be", "replace")
    for blk in re.findall(r"beginbfrange(.*?)endbfrange", txt, re.S):
        for a, c, d in re.findall(
            r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", blk
        ):
            lo, hi, dst = int(a, 16), int(c, 16), int(d, 16)
            for i in range(lo, hi + 1):
                out[i] = chr(dst + (i - lo))
    return out


CMAPS: dict[int, dict[int, str]] = {}
for num, body in objs.items():
    if b"/ToUnicode" not in body:
        continue
    m = re.search(rb"/ToUnicode\s+(\d+)\s+0\s+R", body)
    if not m:
        continue
    cm = objs.get(int(m.group(1)))
    if cm is None:
        continue
    data = stream_of(cm)
    if data:
        CMAPS[num] = parse_cmap(data)

# --- страницы --------------------------------------------------------------
pages: list[int] = []
for num, body in objs.items():
    if re.search(rb"/Type\s*/Page[^s]", body):
        pages.append(num)
pages.sort()


def page_fonts(body: bytes) -> dict[str, dict[int, str]]:
    """Имя ресурса шрифта -> карта код->символ."""
    out: dict[str, dict[int, str]] = {}
    m = re.search(rb"/Font\s*<<(.*?)>>", body, re.S)
    if not m:
        m = re.search(rb"/Font\s+(\d+)\s+0\s+R", body)
        if not m:
            return out
        fdict = objs.get(int(m.group(1)), b"")
        m = re.search(rb"<<(.*?)>>", fdict, re.S)
        if not m:
            return out
    for name, ref in re.findall(rb"/(\w+)\s+(\d+)\s+0\s+R", m.group(1)):
        cm = CMAPS.get(int(ref))
        if cm:
            out[name.decode()] = cm
    return out


def page_content(body: bytes) -> bytes:
    m = re.search(rb"/Contents\s+(\d+)\s+0\s+R", body)
    if m:
        c = objs.get(int(m.group(1)))
        return stream_of(c) if c else b""
    m = re.search(rb"/Contents\s*\[(.*?)\]", body, re.S)
    if m:
        parts = []
        for ref in re.findall(rb"(\d+)\s+0\s+R", m.group(1)):
            c = objs.get(int(ref))
            if c:
                s = stream_of(c)
                if s:
                    parts.append(s)
        return b"\n".join(parts)
    return b""


TOKEN = re.compile(
    rb"/(\w+)\s+[\d.]+\s+Tf|"
    rb"([-\d.]+)\s+([-\d.]+)\s+(Td|TD)|"
    rb"([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm|"
    rb"T\*|"
    rb"\[(.*?)\]\s*TJ|"
    rb"\((.*?)\)\s*Tj|"
    rb"<([0-9A-Fa-f\s]*)>\s*Tj",
    re.S,
)


def decode_hex(h: bytes, cmap: dict[int, str]) -> str:
    s = re.sub(rb"\s", b"", h).decode("latin-1")
    out = []
    for i in range(0, len(s) - 1, 2):
        code = int(s[i : i + 2], 16)
        out.append(cmap.get(code, ""))
    return "".join(out)


def extract(page_num: int) -> list[tuple[float, float, str]]:
    body = objs[page_num]
    fonts = page_fonts(body)
    content = page_content(body)
    cmap: dict[int, str] = {}
    x = y = 0.0
    items: list[tuple[float, float, str]] = []
    for m in TOKEN.finditer(content):
        if m.group(1):
            cmap = fonts.get(m.group(1).decode(), {})
        elif m.group(3):
            x += float(m.group(2))
            y += float(m.group(3))
        elif m.group(9):
            x, y = float(m.group(9)), float(m.group(10))
        elif m.group(11) is not None:
            txt = ""
            for part in re.findall(rb"\((.*?)\)|<([0-9A-Fa-f\s]*)>", m.group(11), re.S):
                if part[0]:
                    txt += part[0].decode("latin-1")
                else:
                    txt += decode_hex(part[1], cmap)
            if txt.strip():
                items.append((x, y, txt))
        elif m.group(12) is not None:
            txt = m.group(12).decode("latin-1")
            if txt.strip():
                items.append((x, y, txt))
        elif m.group(13) is not None:
            txt = decode_hex(m.group(13), cmap)
            if txt.strip():
                items.append((x, y, txt))
    return items


if __name__ == "__main__":
    lo = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    hi = int(sys.argv[2]) if len(sys.argv) > 2 else lo + 1
    print(f"страниц: {len(pages)}")
    for idx in range(lo, min(hi, len(pages))):
        items = extract(pages[idx])
        print(f"\n########## страница {idx + 1} ({len(items)} фрагментов) ##########")
        for x, y, t in items[:400]:
            print(f"  x={x:7.1f} y={y:7.1f}  {t!r}")
