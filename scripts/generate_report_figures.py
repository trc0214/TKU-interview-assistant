from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "report-assets"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def svg_header(width: int, height: int, title: str) -> list[str]:
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        "<defs>",
        "<style>",
        "text { font-family: 'Microsoft JhengHei', 'Noto Sans CJK TC', Arial, sans-serif; }",
        ".title { font-size: 22px; font-weight: 700; fill: #102a43; }",
        ".subtitle { font-size: 13px; fill: #52606d; }",
        ".box { fill: #f8fafc; stroke: #334e68; stroke-width: 1.5; rx: 14; ry: 14; }",
        ".accent { fill: #e6f6ff; stroke: #0b7285; stroke-width: 1.5; rx: 14; ry: 14; }",
        ".line { stroke: #334e68; stroke-width: 2.2; fill: none; marker-end: url(#arrow); }",
        ".label { font-size: 14px; fill: #102a43; font-weight: 600; }",
        ".small { font-size: 12px; fill: #243b53; }",
        ".axis { stroke: #94a3b8; stroke-width: 1; }",
        ".bar { fill: #0b7285; }",
        ".bar2 { fill: #1c7ed6; }",
        "</style>",
        '<marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">',
        '<path d="M0,0 L0,6 L8,3 z" fill="#334e68" />',
        "</marker>",
        "</defs>",
        f'<rect x="0" y="0" width="{width}" height="{height}" fill="#ffffff" />',
        f'<text x="{width / 2}" y="34" text-anchor="middle" class="title">{escape(title)}</text>',
    ]


def box(x: int, y: int, w: int, h: int, title: str, lines: list[str], accent: bool = False) -> list[str]:
    klass = "accent" if accent else "box"
    output = [f'<rect class="{klass}" x="{x}" y="{y}" width="{w}" height="{h}" />']
    output.append(
        f'<text x="{x + w / 2}" y="{y + 28}" text-anchor="middle" class="label">{escape(title)}</text>'
    )
    start_y = y + 50
    for index, line in enumerate(lines):
        output.append(
            f'<text x="{x + 16}" y="{start_y + index * 18}" class="small">{escape(line)}</text>'
        )
    return output


def arrow(x1: int, y1: int, x2: int, y2: int) -> str:
    return f'<path class="line" d="M {x1} {y1} L {x2} {y2}" />'


def write_svg(path: Path, body: list[str]) -> None:
    path.write_text("\n".join(body) + "\n</svg>\n", encoding="utf-8")


# Figure 1: architecture diagram
arch = svg_header(1200, 620, "系統整體架構圖")
arch += box(40, 130, 220, 120, "使用者層", ["求職者", "面試官", "管理者"], accent=True)
arch += box(300, 100, 240, 180, "前端介面", ["Electron 主程式", "React 頁面", "面試 / 履歷 / 設定"], accent=False)
arch += box(590, 100, 240, 180, "後端 API", ["FastAPI", "驗證 / CRUD", "語音與 AI 路由"], accent=False)
arch += box(880, 70, 260, 130, "語音服務", ["Azure Speech", "Whisper fallback", "語音狀態監控"], accent=True)
arch += box(880, 240, 260, 130, "AI 生成服務", ["Gemini", "RAG retrieval", "面試回饋與摘要"], accent=True)
arch += box(590, 330, 240, 150, "資料層", ["SQLite / DB", "履歷資料", "面試紀錄"], accent=False)
arch += box(300, 340, 240, 150, "即時會議頁", ["LiveKit / 線上互動", "語音轉文字", "3 欄式資訊整合"], accent=False)
arch.append(arrow(260, 190, 300, 190))
arch.append(arrow(540, 190, 590, 190))
arch.append(arrow(710, 280, 710, 330))
arch.append(arrow(710, 405, 540, 405))
arch.append(arrow(540, 405, 540, 280))
arch.append(arrow(830, 170, 880, 135))
arch.append(arrow(830, 210, 880, 305))
arch.append(arrow(670, 330, 670, 280))
arch.append(arrow(540, 395, 300, 395))
arch += [
    '<text x="40" y="560" class="subtitle">說明：此圖整理前端、後端、語音、AI 與資料層之間的主要關係，用於報告的系統架構章節。</text>'
]
write_svg(OUT_DIR / "system_architecture.svg", arch)


# Figure 2: speech / AI pipeline
flow = svg_header(1200, 500, "語音辨識與 AI 回饋流程圖")
steps = [
    (55, 150, 180, 96, "1. 收音", ["麥克風輸入", "Browser / Electron"], True),
    (270, 150, 180, 96, "2. STT", ["Azure Speech", "Whisper fallback"], False),
    (485, 150, 180, 96, "3. 正規化", ["切詞", "雜訊處理", "文字驗證"], False),
    (700, 150, 180, 96, "4. RAG", ["檢索相關片段", "建立上下文"], True),
    (915, 150, 180, 96, "5. 生成", ["Gemini 回覆", "面試建議"], False),
]
for x, y, w, h, title, lines, accent in steps:
    flow += box(x, y, w, h, title, lines, accent=accent)
for x1, x2 in [(235, 270), (450, 485), (665, 700), (880, 915)]:
    flow.append(arrow(x1, 198, x2, 198))
flow += [
    '<text x="70" y="340" class="small">輸出：逐字稿、面試重點、緩衝句建議、結構化回答提示</text>',
    '<text x="70" y="365" class="small">設計原則：將語音辨識與語意生成拆成獨立模組，以降低耦合並提升可維護性。</text>',
    '<text x="70" y="390" class="small">此圖可放置於「研究方法」與「功能流程」章節。</text>',
]
write_svg(OUT_DIR / "speech_pipeline.svg", flow)


# Figure 3: repository module distribution
chart = svg_header(1200, 560, "專案模組分布圖")
chart += [
    '<line x1="90" y1="440" x2="1100" y2="440" class="axis" />',
    '<line x1="90" y1="110" x2="90" y2="440" class="axis" />',
]
modules = [
    ("前端頁面", 9, "#0b7285"),
    ("前端元件", 5, "#1c7ed6"),
    ("前端 API / service", 6, "#228be6"),
    ("後端 routers", 6, "#339af0"),
    ("後端 services", 10, "#4dabf7"),
    ("核心 / 設定", 4, "#74c0fc"),
]
max_value = 10
bar_width = 120
gap = 55
start_x = 140
for index, (name, value, color) in enumerate(modules):
    height = int((value / max_value) * 250)
    x = start_x + index * (bar_width + gap)
    y = 440 - height
    chart.append(f'<rect x="{x}" y="{y}" width="{bar_width}" height="{height}" fill="{color}" rx="10" ry="10" />')
    chart.append(f'<text x="{x + bar_width / 2}" y="{y - 12}" text-anchor="middle" class="label">{value}</text>')
    chart.append(f'<text x="{x + bar_width / 2}" y="470" text-anchor="middle" class="small">{escape(name)}</text>')
chart += [
    '<text x="25" y="120" class="small" transform="rotate(-90 25 120)">模組數量</text>',
    '<text x="92" y="470" class="small">0</text>',
    '<text x="82" y="188" class="small">5</text>',
    '<text x="76" y="118" class="small">10</text>',
    '<text x="90" y="515" class="subtitle">說明：此圖依據專案現有目錄結構整理前後端主要模組數量，可作為架構複雜度與維護性說明的輔助圖。</text>',
]
write_svg(OUT_DIR / "module_distribution.svg", chart)

print(f"Generated figures in {OUT_DIR}")
