/**
 * W-01 시안의 비전 그림 3장 (docs/design/W-01.dc.html 그대로). "비전 · 실제 구현 아님" — 데이터가 아니라 그림이다.
 * 1대 동선 하나 → 10대 통로가 보이기 시작 → 많은 차, 통로와 칸 구조가 드러남
 */
export const VISION_FIGURES: { label: string; caption: string; svg: string }[] = [
  {
    label: "한 대의 주차 동선",
    caption: "1대 · 동선 하나",
    svg: "<path d=\"M0 140 H230 C 200 140, 190 120, 186 60\" fill=\"none\" stroke=\"#1e1e1e\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-dasharray=\"7 7\"></path>",
  },
  {
    label: "열 대의 주차 동선이 겹친 모습",
    caption: "10대 · 통로가 보이기 시작",
    svg: "<path d=\"M0 140 H230 C 200 140, 190 120, 186 60\" fill=\"none\" stroke=\"#1e1e1e\" stroke-opacity=\"0.45\" stroke-width=\"3\" stroke-linecap=\"round\"></path> <path d=\"M0 136 H150 C 120 136, 110 116, 106 60\" fill=\"none\" stroke=\"#1e1e1e\" stroke-opacity=\"0.45\" stroke-width=\"3\" stroke-linecap=\"round\"></path> <path d=\"M0 144 H310 C 280 144, 270 124, 266 60\" fill=\"none\" stroke=\"#1e1e1e\" stroke-opacity=\"0.45\" stroke-width=\"3\" stroke-linecap=\"round\"></path> <path d=\"M0 142 H120 C 140 142, 150 160, 152 196\" fill=\"none\" stroke=\"#1e1e1e\" stroke-opacity=\"0.45\" stroke-width=\"3\" stroke-linecap=\"round\"></path> <path d=\"M0 138 H260 C 280 138, 290 160, 292 196\" fill=\"none\" stroke=\"#1e1e1e\" stroke-opacity=\"0.45\" stroke-width=\"3\" stroke-linecap=\"round\"></path> <path d=\"M0 140 H200 C 170 140, 160 118, 146 60\" fill=\"none\" stroke=\"#1e1e1e\" stroke-opacity=\"0.45\" stroke-width=\"3\" stroke-linecap=\"round\"></path>",
  },
  {
    label: "많은 동선이 쌓여 통로와 주차 칸 구조가 드러난 모습",
    caption: "많은 차 · 통로와 칸 구조가 드러남",
    svg: "<rect x=\"0\" y=\"118\" width=\"360\" height=\"44\" fill=\"#1e1e1e\" fill-opacity=\"0.18\"></rect> <path d=\"M20 30 V112 M66 30 V112 M112 30 V112 M158 30 V112 M204 30 V112 M250 30 V112 M296 30 V112 M342 30 V112\" stroke=\"#1e1e1e\" stroke-opacity=\"0.55\" stroke-width=\"3\"></path> <path d=\"M20 168 V196 M66 168 V196 M112 168 V196 M158 168 V196 M204 168 V196 M250 168 V196 M296 168 V196 M342 168 V196\" stroke=\"#1e1e1e\" stroke-opacity=\"0.55\" stroke-width=\"3\"></path> <path d=\"M20 30 H342\" stroke=\"#1e1e1e\" stroke-opacity=\"0.55\" stroke-width=\"3\"></path> <text x=\"16\" y=\"146\" font-family=\"Noto Sans KR, system-ui, sans-serif\" font-size=\"14\" font-weight=\"700\" fill=\"#1e1e1e\">통로</text>",
  },
]
