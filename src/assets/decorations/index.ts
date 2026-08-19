/**
 * 内置装饰库。
 *
 * 所有装饰在 100x100 的坐标系里设计，颜色用色位名（"c1"/"c2"）而不是写死的
 * hex —— 色位在 palette 字段里映射到 palette token，所以装饰会跟着海报配色
 * 自动变色。用户也能在实例上覆盖单个色位。
 *
 * 阶段 2 会补齐到 36 个；这里先放每个分类的代表款，把机制跑通。
 */

import type { Decoration, DecorCategory } from '../../core/model/types'

/** 简写构造器，省掉重复的 builtin/createdAt。 */
function decor(
  id: string,
  name: string,
  category: DecorCategory,
  palette: Record<string, string>,
  elements: Decoration['elements'],
): Decoration {
  return { id, name, category, palette, elements, builtin: true, createdAt: 0 }
}

// ---------------------------------------------------------------- 几何线框

const geometryDecors: Decoration[] = [
  decor(
    'dc_frame_thin',
    '细线方框',
    'geometry',
    { c1: '@accent' },
    [
      {
        kind: 'rect',
        x: 3,
        y: 3,
        w: 94,
        h: 94,
        stroke: 'c1',
        strokeWidth: 1.2,
      },
    ],
  ),
  decor(
    'dc_double_frame',
    '双线方框',
    'geometry',
    { c1: '@accent', c2: '@primary' },
    [
      { kind: 'rect', x: 2, y: 2, w: 96, h: 96, stroke: 'c1', strokeWidth: 1.5 },
      { kind: 'rect', x: 7, y: 7, w: 86, h: 86, stroke: 'c2', strokeWidth: 0.8, opacity: 0.7 },
    ],
  ),
  decor(
    'dc_circle_outline',
    '细线圆环',
    'geometry',
    { c1: '@accent' },
    [{ kind: 'circle', cx: 50, cy: 50, r: 47, stroke: 'c1', strokeWidth: 1.2 }],
  ),
  decor(
    'dc_dot_grid',
    '点阵网格',
    'geometry',
    { c1: '@accent' },
    // 7x7 点阵。手写太长，用循环生成
    Array.from({ length: 49 }, (_, i) => ({
      kind: 'circle' as const,
      cx: 8 + (i % 7) * 14,
      cy: 8 + Math.floor(i / 7) * 14,
      r: 1.4,
      fill: 'c1',
      opacity: 0.85,
    })),
  ),
  decor(
    'dc_stripes',
    '斜条纹',
    'geometry',
    { c1: '@accent' },
    Array.from({ length: 10 }, (_, i) => ({
      kind: 'line' as const,
      // 45° 斜线，从左下往右上扫
      points: [-20 + i * 14, 100, 60 + i * 14, 0],
      stroke: 'c1',
      strokeWidth: 2.5,
      opacity: 0.5,
    })),
  ),
  decor(
    'dc_grid_lines',
    '网格线',
    'geometry',
    { c1: '@accent' },
    [
      ...Array.from({ length: 5 }, (_, i) => ({
        kind: 'line' as const,
        points: [(i + 1) * 16.6, 0, (i + 1) * 16.6, 100],
        stroke: 'c1',
        strokeWidth: 0.6,
        opacity: 0.5,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        kind: 'line' as const,
        points: [0, (i + 1) * 16.6, 100, (i + 1) * 16.6],
        stroke: 'c1',
        strokeWidth: 0.6,
        opacity: 0.5,
      })),
    ],
  ),
  decor(
    'dc_concentric',
    '同心圆',
    'geometry',
    { c1: '@accent' },
    [46, 34, 22, 10].map((r, i) => ({
      kind: 'circle' as const,
      cx: 50,
      cy: 50,
      r,
      stroke: 'c1',
      strokeWidth: 1,
      opacity: 1 - i * 0.15,
    })),
  ),
  decor(
    'dc_arch_outline',
    '拱形线框',
    'geometry',
    { c1: '@accent' },
    [
      {
        kind: 'path',
        // 上半圆 + 两条竖边，写真常用的拱门轮廓
        d: 'M 6 96 L 6 40 A 44 44 0 0 1 94 40 L 94 96',
        stroke: 'c1',
        strokeWidth: 1.4,
        fill: undefined,
      },
    ],
  ),
  decor(
    'dc_cross_marks',
    '十字点阵',
    'geometry',
    { c1: '@accent' },
    Array.from({ length: 9 }, (_, i) => {
      const cx = 16 + (i % 3) * 34
      const cy = 16 + Math.floor(i / 3) * 34
      return [
        {
          kind: 'line' as const,
          points: [cx - 3.5, cy, cx + 3.5, cy],
          stroke: 'c1',
          strokeWidth: 1,
        },
        {
          kind: 'line' as const,
          points: [cx, cy - 3.5, cx, cy + 3.5],
          stroke: 'c1',
          strokeWidth: 1,
        },
      ]
    }).flat(),
  ),
  decor(
    'dc_halftone',
    '渐变网点',
    'geometry',
    { c1: '@accent' },
    // 点的半径随行数递减，做出半调网点的渐隐效果
    Array.from({ length: 8 }, (_, row) =>
      Array.from({ length: 8 }, (_, col) => ({
        kind: 'circle' as const,
        cx: 6 + col * 12.6,
        cy: 6 + row * 12.6,
        r: Math.max(0.5, 3.4 - row * 0.42),
        fill: 'c1',
        opacity: Math.max(0.15, 1 - row * 0.12),
      })),
    ).flat(),
  ),
]

// ---------------------------------------------------------------- 边框角标

const frameDecors: Decoration[] = [
  decor(
    'dc_corner_brackets',
    '四角括号',
    'frame',
    { c1: '@accent' },
    [
      // 左上
      { kind: 'line', points: [4, 22, 4, 4, 22, 4], stroke: 'c1', strokeWidth: 2 },
      // 右上
      { kind: 'line', points: [78, 4, 96, 4, 96, 22], stroke: 'c1', strokeWidth: 2 },
      // 右下
      { kind: 'line', points: [96, 78, 96, 96, 78, 96], stroke: 'c1', strokeWidth: 2 },
      // 左下
      { kind: 'line', points: [22, 96, 4, 96, 4, 78], stroke: 'c1', strokeWidth: 2 },
    ],
  ),
  decor(
    'dc_corner_solid',
    '实角三角',
    'frame',
    { c1: '@accent' },
    [
      { kind: 'path', d: 'M 0 0 L 32 0 L 0 32 Z', fill: 'c1' },
      { kind: 'path', d: 'M 100 100 L 68 100 L 100 68 Z', fill: 'c1' },
    ],
  ),
  decor(
    'dc_dashed_frame',
    '虚线框',
    'frame',
    { c1: '@accent' },
    [
      {
        kind: 'line',
        points: [4, 4, 96, 4, 96, 96, 4, 96, 4, 4],
        stroke: 'c1',
        strokeWidth: 1.2,
        dash: [5, 4],
      },
    ],
  ),
  decor(
    'dc_frame_ticks',
    '刻度边框',
    'frame',
    { c1: '@accent' },
    [
      { kind: 'rect', x: 5, y: 5, w: 90, h: 90, stroke: 'c1', strokeWidth: 1 },
      // 四条边中点各一个短刻度
      { kind: 'line', points: [50, 5, 50, 11], stroke: 'c1', strokeWidth: 1.4 },
      { kind: 'line', points: [50, 89, 50, 95], stroke: 'c1', strokeWidth: 1.4 },
      { kind: 'line', points: [5, 50, 11, 50], stroke: 'c1', strokeWidth: 1.4 },
      { kind: 'line', points: [89, 50, 95, 50], stroke: 'c1', strokeWidth: 1.4 },
    ],
  ),
  decor(
    'dc_frame_offset',
    '错位双框',
    'frame',
    { c1: '@accent', c2: '@primary' },
    [
      { kind: 'rect', x: 10, y: 4, w: 86, h: 86, stroke: 'c2', strokeWidth: 1.2, opacity: 0.75 },
      { kind: 'rect', x: 4, y: 10, w: 86, h: 86, stroke: 'c1', strokeWidth: 1.4 },
    ],
  ),
  decor(
    'dc_bracket_pair',
    '左右括号',
    'frame',
    { c1: '@accent' },
    [
      { kind: 'line', points: [18, 8, 6, 8, 6, 92, 18, 92], stroke: 'c1', strokeWidth: 2 },
      { kind: 'line', points: [82, 8, 94, 8, 94, 92, 82, 92], stroke: 'c1', strokeWidth: 2 },
    ],
  ),
]

// ---------------------------------------------------------------- 胶带贴纸

const stickerDecors: Decoration[] = [
  decor(
    'dc_tape',
    '胶带',
    'sticker',
    { c1: '@accent' },
    [
      {
        kind: 'path',
        // 两端做成撕口的锯齿
        d:
          'M 2 34 L 8 30 L 14 34 L 20 30 L 26 34 L 32 30 L 98 30 ' +
          'L 92 34 L 98 38 L 92 42 L 98 46 L 98 66 ' +
          'L 92 62 L 98 58 L 32 66 L 26 62 L 20 66 L 14 62 L 8 66 L 2 62 Z',
        fill: 'c1',
        opacity: 0.75,
      },
    ],
  ),
  decor(
    'dc_badge',
    '圆形徽章',
    'sticker',
    { c1: '@accent', c2: '@bg' },
    [
      { kind: 'circle', cx: 50, cy: 50, r: 46, fill: 'c1' },
      { kind: 'circle', cx: 50, cy: 50, r: 39, stroke: 'c2', strokeWidth: 1.5 },
    ],
  ),
  decor(
    'dc_scalloped_badge',
    '花边徽章',
    'sticker',
    { c1: '@accent', c2: '@bg' },
    [
      // 一圈小圆当花边，再盖一个实心圆
      ...Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2
        return {
          kind: 'circle' as const,
          cx: 50 + Math.cos(a) * 42,
          cy: 50 + Math.sin(a) * 42,
          r: 7,
          fill: 'c1',
        }
      }),
      { kind: 'circle', cx: 50, cy: 50, r: 42, fill: 'c1' },
      { kind: 'circle', cx: 50, cy: 50, r: 34, stroke: 'c2', strokeWidth: 1.4 },
    ],
  ),
  decor(
    'dc_price_tag',
    '标签牌',
    'sticker',
    { c1: '@accent', c2: '@bg' },
    [
      { kind: 'path', d: 'M 8 30 L 76 30 L 96 50 L 76 70 L 8 70 Z', fill: 'c1' },
      { kind: 'circle', cx: 20, cy: 50, r: 4, fill: 'c2' },
    ],
  ),
  decor(
    'dc_speech_bubble',
    '对话气泡',
    'sticker',
    { c1: '@accent' },
    [
      { kind: 'rect', x: 6, y: 14, w: 88, h: 56, rx: 10, fill: 'c1' },
      { kind: 'path', d: 'M 26 68 L 24 90 L 44 70 Z', fill: 'c1' },
    ],
  ),
  decor(
    'dc_sticker_star',
    '星形贴纸',
    'sticker',
    { c1: '@accent', c2: '@bg' },
    [
      {
        kind: 'path',
        // 正五角星
        d: 'M 50 4 L 62 36 L 96 38 L 69 59 L 79 92 L 50 73 L 21 92 L 31 59 L 4 38 L 38 36 Z',
        fill: 'c1',
      },
      {
        kind: 'path',
        d: 'M 50 20 L 58 41 L 80 42 L 62 56 L 69 78 L 50 65 L 31 78 L 38 56 L 20 42 L 42 41 Z',
        stroke: 'c2',
        strokeWidth: 1,
      },
    ],
  ),
]

// ---------------------------------------------------------------- 星芒闪耀

const sparkleDecors: Decoration[] = [
  decor(
    'dc_sparkle_four',
    '四角星芒',
    'sparkle',
    { c1: '@accent' },
    [
      {
        kind: 'path',
        // 内凹的四角星，比正菱形更有「闪」的感觉
        d: 'M 50 0 C 54 38 62 46 100 50 C 62 54 54 62 50 100 C 46 62 38 54 0 50 C 38 46 46 38 50 0 Z',
        fill: 'c1',
      },
    ],
  ),
  decor(
    'dc_sparkle_trio',
    '三颗星',
    'sparkle',
    { c1: '@accent' },
    [
      {
        kind: 'path',
        d: 'M 28 8 C 30 26 34 30 52 32 C 34 34 30 38 28 56 C 26 38 22 34 4 32 C 22 30 26 26 28 8 Z',
        fill: 'c1',
      },
      {
        kind: 'path',
        d: 'M 74 44 C 75 56 78 59 90 60 C 78 61 75 64 74 76 C 73 64 70 61 58 60 C 70 59 73 56 74 44 Z',
        fill: 'c1',
        opacity: 0.85,
      },
      {
        kind: 'path',
        d: 'M 44 76 C 45 84 47 86 55 87 C 47 88 45 90 44 98 C 43 90 41 88 33 87 C 41 86 43 84 44 76 Z',
        fill: 'c1',
        opacity: 0.7,
      },
    ],
  ),
  decor(
    'dc_sparkle_burst',
    '放射光芒',
    'sparkle',
    { c1: '@accent' },
    // 12 条从中心放射的线，长短交替
    Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2
      const len = i % 2 === 0 ? 46 : 32
      return {
        kind: 'line' as const,
        points: [
          50 + Math.cos(a) * 10,
          50 + Math.sin(a) * 10,
          50 + Math.cos(a) * len,
          50 + Math.sin(a) * len,
        ],
        stroke: 'c1',
        strokeWidth: i % 2 === 0 ? 2 : 1.2,
        opacity: i % 2 === 0 ? 1 : 0.7,
      }
    }),
  ),
  decor(
    'dc_sparkle_scatter',
    '散落星点',
    'sparkle',
    { c1: '@accent' },
    [
      { cx: 18, cy: 22, r: 2.6, o: 1 },
      { cx: 74, cy: 14, r: 1.6, o: 0.85 },
      { cx: 88, cy: 46, r: 2.2, o: 0.9 },
      { cx: 34, cy: 58, r: 1.2, o: 0.7 },
      { cx: 58, cy: 78, r: 2.8, o: 1 },
      { cx: 12, cy: 82, r: 1.5, o: 0.75 },
      { cx: 66, cy: 38, r: 1, o: 0.6 },
      { cx: 42, cy: 8, r: 1.3, o: 0.65 },
      { cx: 92, cy: 84, r: 1.8, o: 0.8 },
    ].map((p) => ({
      kind: 'circle' as const,
      cx: p.cx,
      cy: p.cy,
      r: p.r,
      fill: 'c1',
      opacity: p.o,
    })),
  ),
  decor(
    'dc_twinkle_plus',
    '十字闪光',
    'sparkle',
    { c1: '@accent' },
    [
      // 大的一颗
      {
        kind: 'path',
        d: 'M 34 6 C 36 26 40 30 60 32 C 40 34 36 38 34 58 C 32 38 28 34 8 32 C 28 30 32 26 34 6 Z',
        fill: 'c1',
      },
      // 小的两颗
      { kind: 'line', points: [76, 44, 76, 66], stroke: 'c1', strokeWidth: 2.2 },
      { kind: 'line', points: [65, 55, 87, 55], stroke: 'c1', strokeWidth: 2.2 },
      { kind: 'line', points: [50, 76, 50, 90], stroke: 'c1', strokeWidth: 1.6, opacity: 0.8 },
      { kind: 'line', points: [43, 83, 57, 83], stroke: 'c1', strokeWidth: 1.6, opacity: 0.8 },
    ],
  ),
]

// ---------------------------------------------------------------- 光斑噪点

const lightDecors: Decoration[] = [
  decor(
    'dc_glow',
    '柔光斑',
    'light',
    { c1: '@accent' },
    // 同心圆逐层降透明度，模拟发光。真高斯模糊要额外 filter，这样更省
    [
      { kind: 'circle', cx: 50, cy: 50, r: 48, fill: 'c1', opacity: 0.08 },
      { kind: 'circle', cx: 50, cy: 50, r: 38, fill: 'c1', opacity: 0.1 },
      { kind: 'circle', cx: 50, cy: 50, r: 28, fill: 'c1', opacity: 0.14 },
      { kind: 'circle', cx: 50, cy: 50, r: 18, fill: 'c1', opacity: 0.2 },
      { kind: 'circle', cx: 50, cy: 50, r: 9, fill: 'c1', opacity: 0.32 },
    ],
  ),
  decor(
    'dc_lens_flare',
    '横向光晕',
    'light',
    { c1: '@accent' },
    [
      { kind: 'line', points: [0, 50, 100, 50], stroke: 'c1', strokeWidth: 1.5, opacity: 0.5 },
      { kind: 'circle', cx: 50, cy: 50, r: 14, fill: 'c1', opacity: 0.22 },
      { kind: 'circle', cx: 50, cy: 50, r: 6, fill: 'c1', opacity: 0.4 },
      { kind: 'circle', cx: 72, cy: 50, r: 4, fill: 'c1', opacity: 0.25 },
      { kind: 'circle', cx: 26, cy: 50, r: 2.5, fill: 'c1', opacity: 0.2 },
    ],
  ),
  decor(
    'dc_light_beam',
    '斜射光束',
    'light',
    { c1: '@accent' },
    // 几条不等宽的斜向长条，模拟从窗外射进来的光
    [
      { kind: 'path', d: 'M -10 0 L 22 0 L 62 100 L 30 100 Z', fill: 'c1', opacity: 0.12 },
      { kind: 'path', d: 'M 30 0 L 44 0 L 84 100 L 70 100 Z', fill: 'c1', opacity: 0.09 },
      { kind: 'path', d: 'M 56 0 L 62 0 L 102 100 L 96 100 Z', fill: 'c1', opacity: 0.07 },
    ],
  ),
  decor(
    'dc_vignette_corners',
    '四角压暗',
    'light',
    { c1: '@bg' },
    // 四角各一个大圆，靠低透明度叠出暗角
    [
      { kind: 'circle', cx: 0, cy: 0, r: 44, fill: 'c1', opacity: 0.2 },
      { kind: 'circle', cx: 100, cy: 0, r: 44, fill: 'c1', opacity: 0.2 },
      { kind: 'circle', cx: 0, cy: 100, r: 44, fill: 'c1', opacity: 0.2 },
      { kind: 'circle', cx: 100, cy: 100, r: 44, fill: 'c1', opacity: 0.2 },
    ],
  ),
  decor(
    'dc_grain',
    '颗粒噪点',
    'light',
    { c1: '@textOnBg' },
    // 伪随机散点。用固定的算式而不是 Math.random，保证每次渲染一致
    Array.from({ length: 120 }, (_, i) => {
      const a = (i * 2654435761) % 4096
      const b = (i * 40503 + 12345) % 4096
      return {
        kind: 'circle' as const,
        cx: (a / 4096) * 100,
        cy: (b / 4096) * 100,
        r: 0.45 + ((i * 7) % 5) * 0.12,
        fill: 'c1',
        opacity: 0.06 + ((i * 11) % 7) * 0.012,
      }
    }),
  ),
]

// ---------------------------------------------------------------- 笔触墨迹

const brushDecors: Decoration[] = [
  decor(
    'dc_brush_stroke',
    '横向笔触',
    'brush',
    { c1: '@accent' },
    [
      {
        kind: 'path',
        // 一头粗一头细，带点起伏，像真的刷了一笔
        d: 'M 3 56 C 20 40 38 62 56 46 C 72 32 88 50 98 38 L 97 52 C 86 66 70 48 55 62 C 38 78 19 56 4 70 Z',
        fill: 'c1',
        opacity: 0.9,
      },
    ],
  ),
  decor(
    'dc_ink_dots',
    '墨点飞溅',
    'brush',
    { c1: '@accent' },
    [
      { kind: 'circle', cx: 30, cy: 40, r: 11, fill: 'c1' },
      { kind: 'circle', cx: 58, cy: 30, r: 5, fill: 'c1', opacity: 0.9 },
      { kind: 'circle', cx: 72, cy: 55, r: 7, fill: 'c1', opacity: 0.85 },
      { kind: 'circle', cx: 44, cy: 66, r: 3.5, fill: 'c1', opacity: 0.8 },
      { kind: 'circle', cx: 84, cy: 34, r: 2.2, fill: 'c1', opacity: 0.7 },
      { kind: 'circle', cx: 20, cy: 66, r: 2.8, fill: 'c1', opacity: 0.65 },
      { kind: 'circle', cx: 62, cy: 76, r: 1.8, fill: 'c1', opacity: 0.6 },
    ],
  ),
  decor(
    'dc_brush_circle',
    '笔刷圆环',
    'brush',
    { c1: '@accent' },
    [
      {
        kind: 'path',
        // 不闭合的手绘圆，起笔收笔粗细不同
        d:
          'M 76 26 C 62 12 34 14 22 30 C 8 48 14 74 34 84 C 56 95 84 84 88 62 ' +
          'C 90 50 86 40 78 33 L 74 38 C 82 45 84 54 82 62 C 78 78 56 87 38 79 ' +
          'C 22 71 17 50 28 35 C 38 22 62 20 73 32 Z',
        fill: 'c1',
        opacity: 0.9,
      },
    ],
  ),
  decor(
    'dc_brush_underline',
    '手绘下划线',
    'brush',
    { c1: '@accent' },
    [
      {
        kind: 'path',
        // 两头细中间粗，略带弧度
        d: 'M 4 58 C 26 48 62 46 96 52 L 96 60 C 62 55 26 57 4 66 Z',
        fill: 'c1',
      },
    ],
  ),
  decor(
    'dc_brush_x',
    '手绘叉',
    'brush',
    { c1: '@accent' },
    [
      { kind: 'path', d: 'M 12 10 L 22 6 L 92 84 L 82 90 Z', fill: 'c1', opacity: 0.92 },
      { kind: 'path', d: 'M 88 8 L 96 16 L 20 92 L 12 84 Z', fill: 'c1', opacity: 0.92 },
    ],
  ),
  decor(
    'dc_scribble',
    '涂鸦线团',
    'brush',
    { c1: '@accent' },
    [
      {
        kind: 'line',
        points: [
          10, 60, 26, 30, 44, 66, 60, 26, 76, 62, 90, 34, 78, 78, 52, 52, 30, 84, 14, 44,
        ],
        stroke: 'c1',
        strokeWidth: 2.2,
        opacity: 0.85,
      },
    ],
  ),
]

// ---------------------------------------------------------------- 丝带绶带

const ribbonDecors: Decoration[] = [
  decor(
    'dc_ribbon',
    '绶带',
    'ribbon',
    { c1: '@primary' },
    [
      // 主体色带，两端切出燕尾缺口
      {
        kind: 'path',
        d: 'M 0 30 L 100 30 L 88 50 L 100 70 L 0 70 L 12 50 Z',
        fill: 'c1',
      },
    ],
  ),
  decor(
    'dc_ribbon_folded',
    '折角绶带',
    'ribbon',
    { c1: '@primary', c2: '@accent' },
    [
      // 背后的折角，压深一点做出层次
      { kind: 'path', d: 'M 6 22 L 20 30 L 6 38 Z', fill: 'c2', opacity: 0.8 },
      { kind: 'path', d: 'M 94 22 L 80 30 L 94 38 Z', fill: 'c2', opacity: 0.8 },
      { kind: 'path', d: 'M 12 30 L 88 30 L 88 70 L 50 58 L 12 70 Z', fill: 'c1' },
    ],
  ),
  decor(
    'dc_banner_hang',
    '垂挂横幅',
    'ribbon',
    { c1: '@primary', c2: '@accent' },
    [
      { kind: 'line', points: [8, 8, 92, 8], stroke: 'c2', strokeWidth: 1.2 },
      { kind: 'path', d: 'M 20 8 L 80 8 L 80 76 L 50 62 L 20 76 Z', fill: 'c1' },
    ],
  ),
  decor(
    'dc_diagonal_sash',
    '斜向飘带',
    'ribbon',
    { c1: '@primary' },
    [
      {
        kind: 'path',
        d: 'M -6 66 L 106 22 L 106 46 L -6 90 Z',
        fill: 'c1',
        opacity: 0.92,
      },
    ],
  ),
]

// ---------------------------------------------------------------- 日期戳

const stampDecors: Decoration[] = [
  decor(
    'dc_barcode',
    '条形码',
    'stamp',
    { c1: '@textOnBg' },
    // 宽窄不一的竖条，模拟真条形码
    [2, 5, 2, 3, 6, 2, 4, 2, 7, 3, 2, 5, 3, 2, 6, 2, 4, 3, 2, 7].map((w, i, arr) => {
      const x = arr.slice(0, i).reduce((s, v) => s + v + 2, 4)
      return {
        kind: 'rect' as const,
        x,
        y: 10,
        w,
        h: 68,
        fill: 'c1',
      }
    }),
  ),
  decor(
    'dc_crop_marks',
    '裁切标记',
    'stamp',
    { c1: '@textOnBg' },
    [
      { kind: 'line', points: [0, 10, 20, 10], stroke: 'c1', strokeWidth: 1 },
      { kind: 'line', points: [10, 0, 10, 20], stroke: 'c1', strokeWidth: 1 },
      { kind: 'line', points: [80, 90, 100, 90], stroke: 'c1', strokeWidth: 1 },
      { kind: 'line', points: [90, 80, 90, 100], stroke: 'c1', strokeWidth: 1 },
    ],
  ),
  decor(
    'dc_date_stamp',
    '日期戳框',
    'stamp',
    { c1: '@accent' },
    [
      { kind: 'rect', x: 4, y: 32, w: 92, h: 36, rx: 3, stroke: 'c1', strokeWidth: 1.6 },
      // 内部几条横线示意数字位置
      { kind: 'line', points: [14, 50, 30, 50], stroke: 'c1', strokeWidth: 3 },
      { kind: 'line', points: [36, 50, 52, 50], stroke: 'c1', strokeWidth: 3 },
      { kind: 'line', points: [58, 50, 86, 50], stroke: 'c1', strokeWidth: 3 },
    ],
  ),
  decor(
    'dc_perforation',
    '票券齿孔',
    'stamp',
    { c1: '@bg' },
    // 上下两排半圆缺口，票根的经典特征
    Array.from({ length: 11 }, (_, i) => [
      { kind: 'circle' as const, cx: i * 10, cy: 4, r: 3.4, fill: 'c1' },
      { kind: 'circle' as const, cx: i * 10, cy: 96, r: 3.4, fill: 'c1' },
    ]).flat(),
  ),
  decor(
    'dc_seal_round',
    '圆形印章',
    'stamp',
    { c1: '@accent' },
    [
      { kind: 'circle', cx: 50, cy: 50, r: 44, stroke: 'c1', strokeWidth: 3 },
      { kind: 'circle', cx: 50, cy: 50, r: 34, stroke: 'c1', strokeWidth: 1.2 },
      {
        kind: 'path',
        d: 'M 50 14 L 58 40 L 86 40 L 63 56 L 71 82 L 50 66 L 29 82 L 37 56 L 14 40 L 42 40 Z',
        fill: 'c1',
        opacity: 0.85,
      },
    ],
  ),
]

// ---------------------------------------------------------------- 汇总

export const BUILTIN_DECORATIONS: Decoration[] = [
  ...geometryDecors,
  ...frameDecors,
  ...stickerDecors,
  ...sparkleDecors,
  ...lightDecors,
  ...brushDecors,
  ...ribbonDecors,
  ...stampDecors,
]

const BUILTIN_MAP = new Map(BUILTIN_DECORATIONS.map((d) => [d.id, d]))

/**
 * 用户自定义装饰的运行时缓存。
 *
 * 渲染是同步的，没法在里面 await IndexedDB。所以进入编辑器时先把自定义
 * 装饰全量灌进这个缓存，渲染时同步查表。装饰数据量很小（都是矢量路径），
 * 全量驻留内存没问题。
 */
const customCache = new Map<string, Decoration>()

/** 把自定义装饰灌进缓存。Editor 挂载时调用一次。 */
export function primeCustomDecorations(list: Decoration[]): void {
  customCache.clear()
  for (const d of list) customCache.set(d.id, d)
}

/** 单个装饰存好后同步进缓存，不用重灌全量。 */
export function cacheCustomDecoration(d: Decoration): void {
  customCache.set(d.id, d)
}

export function uncacheCustomDecoration(id: string): void {
  customCache.delete(id)
}

export function getDecoration(id: string): Decoration | undefined {
  return BUILTIN_MAP.get(id) ?? customCache.get(id)
}

export function allDecorations(): Decoration[] {
  return [...BUILTIN_DECORATIONS, ...customCache.values()]
}
