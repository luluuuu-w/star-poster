/**
 * 内置版型模板库。
 *
 * 每个模板是纯函数 (ctx) => Layer[]。颜色一律用 palette token，几何一律
 * 用相对值，所以换照片、换配色、换画布尺寸都自动适配。
 */

import { solid, type Layer } from '../../model/types'
import {
  coverCrop,
  createPhotoLayer,
  createShapeLayer,
  createTextLayer,
} from '../../model/doc'
import type { BuildContext, LayoutTemplate } from '../types'

/** 照片按 cover 填满给定框，并把焦点尽量居中，避免自动裁切切到脸。 */
function photoIn(ctx: BuildContext, frame: { x: number; y: number; w: number; h: number }) {
  // 目标框的实际宽高比要算上画布本身的宽高比
  const targetAspect = (frame.w * ctx.canvas.width) / (frame.h * ctx.canvas.height)

  const layer = createPhotoLayer(ctx.assetId, frame)
  layer.crop = coverCrop(ctx.analysis.aspect, targetAspect, ctx.analysis.focus)
  return layer
}

/**
 * 按字数估一个合适的字号。
 * 长名字用大字号会溢出框，这个函数让「王」和「欧阳娜娜娜」都能排得下。
 */
function fitFontSize(text: string, boxWidth: number, base: number): number {
  const chars = countVisualChars(text)
  if (chars === 0) return base
  // 中文字宽约等于字号，英文约 0.55 倍，这里按整体估
  const maxByWidth = (boxWidth * 1.0) / chars
  return Math.min(base, maxByWidth)
}

/** 中文按 1 个宽度算，ASCII 按 0.55 算。 */
function countVisualChars(text: string): number {
  let n = 0
  for (const ch of text) {
    n += ch.charCodeAt(0) < 128 ? 0.55 : 1
  }
  return n
}

/**
 * 从上往下的渐隐遮罩。
 *
 * 压在照片上的文字全靠它保证可读性 —— 照片那一块是亮天空还是暗背景我们
 * 无法预知，加一层往文字方向加深的渐隐是最稳的做法。
 */
function scrimTop(frame: { x: number; y: number; w: number; h: number }, strength = 0.72) {
  return createShapeLayer('rect', frame, {
    name: '顶部渐隐',
    fill: {
      kind: 'gradient',
      angle: 90,
      stops: [
        { offset: 0, color: '@bg', alpha: strength },
        { offset: 0.6, color: '@bg', alpha: strength * 0.45 },
        { offset: 1, color: '@bg', alpha: 0 },
      ],
    },
  })
}

/** 从下往上的渐隐遮罩。 */
function scrimBottom(
  frame: { x: number; y: number; w: number; h: number },
  strength = 0.82,
) {
  return createShapeLayer('rect', frame, {
    name: '底部渐隐',
    fill: {
      kind: 'gradient',
      angle: 90,
      stops: [
        { offset: 0, color: '@bg', alpha: 0 },
        { offset: 0.45, color: '@bg', alpha: strength * 0.55 },
        { offset: 1, color: '@bg', alpha: strength },
      ],
    },
  })
}

// ================================================================ 1. 杂志封面

const magazine: LayoutTemplate = {
  id: 'tpl_magazine',
  name: '杂志封面',
  tags: ['时尚', '大字', '经典'],
  builtin: true,
  createdAt: 0,
  meta: {
    idealAspect: 0.78,
    aspectTolerance: 0.35,
    subjectAnchor: 'center',
    textZones: [
      { x: 0.06, y: 0.03, w: 0.88, h: 0.16 }, // 刊名
      { x: 0.06, y: 0.82, w: 0.6, h: 0.14 }, // 底部信息
    ],
    tonePreference: 'any',
  },
  build(ctx: BuildContext): Layer[] {
    const { texts } = ctx
    const layers: Layer[] = []

    // 照片满版出血
    layers.push(photoIn(ctx, { x: 0, y: 0, w: 1, h: 1 }))

    // 顶部渐隐压暗，保证刊名读得清 —— 照片顶部是亮天空还是暗背景我们无法预知
    layers.push(scrimTop({ x: 0, y: 0, w: 1, h: 0.28 }))

    // 刊名：顶天立地的大字，杂志封面的灵魂
    layers.push(
      createTextLayer(texts.title, { x: 0.05, y: 0.035, w: 0.9, h: 0.16 }, {
        name: '刊名',
        fontId: 'serif',
        fontSize: fitFontSize(texts.title, 0.9, 0.155),
        fontWeight: 700,
        fill: solid('@textOnBg'),
        align: 'center',
        letterSpacing: 0.02,
        lineHeight: 1,
      }),
    )

    // 副标题：细长英文，压在刊名下方
    layers.push(
      createTextLayer(texts.subtitle, { x: 0.05, y: 0.2, w: 0.9, h: 0.05 }, {
        name: '副标题',
        fontId: 'sans',
        fontSize: 0.026,
        fontWeight: 400,
        fill: solid('@textOnBg'),
        align: 'center',
        letterSpacing: 0.5, // 大字距，杂志味
      }),
    )

    // 底部同样渐隐，说明文字才压得住
    layers.push(scrimBottom({ x: 0, y: 0.7, w: 1, h: 0.3 }, 0.8))

    // 左下角竖排色条 + 说明文字
    layers.push(
      createShapeLayer('rect', { x: 0.06, y: 0.84, w: 0.012, h: 0.1 }, {
        name: '强调竖条',
        fill: solid('@accent'),
      }),
    )
    layers.push(
      createTextLayer(texts.caption, { x: 0.1, y: 0.845, w: 0.5, h: 0.09 }, {
        name: '说明',
        fontId: 'sans',
        fontSize: 0.024,
        fontWeight: 500,
        fill: solid('@textOnBg'),
        align: 'left',
        lineHeight: 1.5,
      }),
    )

    return layers
  },
}

// ================================================================ 2. 极简写真

const minimal: LayoutTemplate = {
  id: 'tpl_minimal',
  name: '极简写真',
  tags: ['留白', '安静', '文艺'],
  builtin: true,
  createdAt: 0,
  meta: {
    idealAspect: 0.8,
    aspectTolerance: 0.4,
    subjectAnchor: 'top',
    textZones: [{ x: 0.1, y: 0.76, w: 0.8, h: 0.18 }],
    tonePreference: 'light',
  },
  build(ctx: BuildContext): Layer[] {
    const { texts } = ctx
    const layers: Layer[] = []

    // 大留白：照片只占上方 68%，四周留边
    layers.push(
      createShapeLayer('rect', { x: 0, y: 0, w: 1, h: 1 }, {
        name: '底色',
        fill: solid('@bg'),
      }),
    )

    const photo = photoIn(ctx, { x: 0.08, y: 0.07, w: 0.84, h: 0.66 })
    photo.mask = 'rounded'
    photo.maskRadius = 0.02
    layers.push(photo)

    // 一条细横线，把图和字分开
    layers.push(
      createShapeLayer('rect', { x: 0.08, y: 0.785, w: 0.14, h: 0.003 }, {
        name: '分隔线',
        fill: solid('@accent'),
      }),
    )

    layers.push(
      createTextLayer(texts.title, { x: 0.08, y: 0.81, w: 0.84, h: 0.09 }, {
        name: '标题',
        fontId: 'serif',
        fontSize: fitFontSize(texts.title, 0.84, 0.075),
        fontWeight: 500,
        fill: solid('@textOnBg'),
        align: 'left',
        letterSpacing: 0.06,
        lineHeight: 1.1,
      }),
    )

    layers.push(
      createTextLayer(texts.subtitle, { x: 0.08, y: 0.905, w: 0.84, h: 0.04 }, {
        name: '副标题',
        fontId: 'sans',
        fontSize: 0.021,
        fontWeight: 300,
        fill: solid('@textOnBg'),
        align: 'left',
        letterSpacing: 0.35,
        opacity: 0.7,
      }),
    )

    return layers
  },
}

// ================================================================ 3. 大字报

const bold: LayoutTemplate = {
  id: 'tpl_bold',
  name: '满版大字报',
  tags: ['冲击力', '应援', '潮流'],
  builtin: true,
  createdAt: 0,
  meta: {
    idealAspect: 0.75,
    aspectTolerance: 0.5,
    subjectAnchor: 'full',
    textZones: [{ x: 0.0, y: 0.55, w: 1, h: 0.4 }],
    tonePreference: 'dark',
  },
  build(ctx: BuildContext): Layer[] {
    const { texts } = ctx
    const layers: Layer[] = []

    layers.push(photoIn(ctx, { x: 0, y: 0, w: 1, h: 1 }))

    // 下半部渐隐压暗，给巨型标题让位
    layers.push(
      createShapeLayer('rect', { x: 0, y: 0.34, w: 1, h: 0.66 }, {
        name: '底部压暗',
        fill: {
          kind: 'gradient',
          angle: 90,
          stops: [
            { offset: 0, color: '@bg', alpha: 0 },
            { offset: 0.35, color: '@bg', alpha: 0.62 },
            { offset: 0.7, color: '@bg', alpha: 0.9 },
            { offset: 1, color: '@bg', alpha: 0.95 },
          ],
        },
      }),
    )

    // 巨型标题，撑满宽度
    layers.push(
      createTextLayer(texts.title, { x: 0.04, y: 0.6, w: 0.92, h: 0.22 }, {
        name: '主标题',
        fontId: 'display',
        fontSize: fitFontSize(texts.title, 0.92, 0.21),
        fontWeight: 900,
        fill: solid('@textOnBg'),
        align: 'center',
        letterSpacing: -0.02, // 负字距，大字挤在一起更有力量感
        lineHeight: 0.95,
      }),
    )

    // 标题下方的点缀色块 + 反白小字
    layers.push(
      createShapeLayer('rect', { x: 0.28, y: 0.845, w: 0.44, h: 0.052 }, {
        name: '点缀色块',
        fill: solid('@accent'),
        radius: 0.5,
      }),
    )
    layers.push(
      createTextLayer(texts.subtitle, { x: 0.28, y: 0.857, w: 0.44, h: 0.03 }, {
        name: '副标题',
        fontId: 'sans',
        fontSize: 0.024,
        fontWeight: 700,
        // 这个字压在 accent 色块上，不是压在 bg 上，所以用 bg 反色更稳妥
        fill: solid('@bg'),
        align: 'center',
        letterSpacing: 0.2,
      }),
    )

    layers.push(
      createTextLayer(texts.caption, { x: 0.04, y: 0.925, w: 0.92, h: 0.04 }, {
        name: '说明',
        fontId: 'sans',
        fontSize: 0.019,
        fontWeight: 400,
        fill: solid('@textOnBg'),
        align: 'center',
        letterSpacing: 0.3,
        opacity: 0.75,
      }),
    )

    return layers
  },
}

// ================================================================ 4. 电影海报

const cinema: LayoutTemplate = {
  id: 'tpl_cinema',
  name: '电影海报',
  tags: ['叙事', '留白', '正式'],
  builtin: true,
  createdAt: 0,
  meta: {
    idealAspect: 0.7,
    aspectTolerance: 0.32,
    subjectAnchor: 'top',
    textZones: [{ x: 0.1, y: 0.68, w: 0.8, h: 0.26 }],
    tonePreference: 'dark',
  },
  build(ctx: BuildContext): Layer[] {
    const { texts } = ctx
    const layers: Layer[] = []

    layers.push(photoIn(ctx, { x: 0, y: 0, w: 1, h: 0.78 }))
    // 照片下缘化进底色，做出「海报下半是文字区」的经典结构
    layers.push(scrimBottom({ x: 0, y: 0.5, w: 1, h: 0.28 }, 1))

    layers.push(
      createShapeLayer('rect', { x: 0, y: 0.76, w: 1, h: 0.24 }, {
        name: '文字区底色',
        fill: solid('@bg'),
      }),
    )

    // 演职员表式的细长英文，压在标题上方
    layers.push(
      createTextLayer(texts.subtitle, { x: 0.1, y: 0.72, w: 0.8, h: 0.035 }, {
        name: '副标题',
        fontId: 'sans',
        fontSize: 0.019,
        fontWeight: 500,
        fill: solid('@accentText'),
        align: 'center',
        letterSpacing: 0.55,
      }),
    )

    layers.push(
      createTextLayer(texts.title, { x: 0.06, y: 0.79, w: 0.88, h: 0.12 }, {
        name: '主标题',
        fontId: 'serif',
        fontSize: fitFontSize(texts.title, 0.88, 0.12),
        fontWeight: 700,
        fill: solid('@textOnBg'),
        align: 'center',
        letterSpacing: 0.04,
        lineHeight: 1.05,
      }),
    )

    // 上下两条细线夹住说明，电影海报常见的做法
    layers.push(
      createShapeLayer('rect', { x: 0.3, y: 0.925, w: 0.4, h: 0.0018 }, {
        name: '分隔线',
        fill: solid('@accent'),
        opacity: 0.6,
      }),
    )
    layers.push(
      createTextLayer(texts.caption, { x: 0.1, y: 0.938, w: 0.8, h: 0.035 }, {
        name: '说明',
        fontId: 'sans',
        fontSize: 0.016,
        fontWeight: 400,
        fill: solid('@textOnBg'),
        align: 'center',
        letterSpacing: 0.3,
        opacity: 0.72,
      }),
    )

    return layers
  },
}

// ================================================================ 5. 演唱会应援

const concert: LayoutTemplate = {
  id: 'tpl_concert',
  name: '演唱会应援',
  tags: ['热烈', '应援', '色块'],
  builtin: true,
  createdAt: 0,
  meta: {
    idealAspect: 0.75,
    aspectTolerance: 0.45,
    subjectAnchor: 'center',
    textZones: [
      { x: 0.0, y: 0.04, w: 1, h: 0.12 },
      { x: 0.0, y: 0.8, w: 1, h: 0.16 },
    ],
    tonePreference: 'any',
  },
  build(ctx: BuildContext): Layer[] {
    const { texts } = ctx
    const layers: Layer[] = []

    layers.push(
      createShapeLayer('rect', { x: 0, y: 0, w: 1, h: 1 }, {
        name: '底色',
        fill: solid('@primary'),
      }),
    )

    // 照片做成一个居中的圆角块，四周露出主色，像应援物
    const photo = photoIn(ctx, { x: 0.07, y: 0.17, w: 0.86, h: 0.6 })
    photo.mask = 'rounded'
    photo.maskRadius = 0.05
    layers.push(photo)

    // 顶部斜置色条
    layers.push(
      createShapeLayer('rect', { x: -0.06, y: 0.045, w: 1.12, h: 0.075 }, {
        name: '顶部色条',
        rotation: -2.5,
        fill: solid('@accent'),
      }),
    )
    layers.push(
      createTextLayer(texts.subtitle, { x: 0.05, y: 0.062, w: 0.9, h: 0.045 }, {
        name: '副标题',
        rotation: -2.5,
        fontId: 'sans',
        fontSize: 0.028,
        fontWeight: 800,
        // 压在 accent 色块上，用背景色反白最稳
        fill: solid('@bg'),
        align: 'center',
        letterSpacing: 0.25,
      }),
    )

    // 大名字压在照片下缘，一半叠在照片上一半在色块上
    layers.push(
      createTextLayer(texts.title, { x: 0.04, y: 0.79, w: 0.92, h: 0.14 }, {
        name: '主标题',
        fontId: 'display',
        fontSize: fitFontSize(texts.title, 0.92, 0.135),
        fontWeight: 900,
        fill: solid('@textOnPrimary'),
        align: 'center',
        letterSpacing: -0.01,
        lineHeight: 1,
        stroke: { color: '@bg', width: 0.0025 },
      }),
    )

    layers.push(
      createTextLayer(texts.caption, { x: 0.1, y: 0.94, w: 0.8, h: 0.035 }, {
        name: '说明',
        fontId: 'sans',
        fontSize: 0.018,
        fontWeight: 600,
        fill: solid('@textOnPrimary'),
        align: 'center',
        letterSpacing: 0.28,
        opacity: 0.85,
      }),
    )

    return layers
  },
}

// ================================================================ 6. 拼贴风

const collage: LayoutTemplate = {
  id: 'tpl_collage',
  name: '拼贴风',
  tags: ['杂志剪贴', '活泼', '错位'],
  builtin: true,
  createdAt: 0,
  meta: {
    idealAspect: 0.85,
    aspectTolerance: 0.5,
    subjectAnchor: 'center',
    textZones: [{ x: 0.04, y: 0.72, w: 0.92, h: 0.22 }],
    tonePreference: 'any',
  },
  build(ctx: BuildContext): Layer[] {
    const { texts } = ctx
    const layers: Layer[] = []

    layers.push(
      createShapeLayer('rect', { x: 0, y: 0, w: 1, h: 1 }, {
        name: '底色',
        fill: solid('@bg'),
      }),
    )

    // 错位色块垫在照片后面，制造剪贴的层次
    layers.push(
      createShapeLayer('rect', { x: 0.16, y: 0.1, w: 0.7, h: 0.56 }, {
        name: '衬底色块',
        rotation: -5,
        fill: solid('@accent'),
      }),
    )
    layers.push(
      createShapeLayer('rect', { x: 0.1, y: 0.15, w: 0.62, h: 0.5 }, {
        name: '衬底色块 2',
        rotation: 4,
        fill: solid('@surface'),
      }),
    )

    // 照片本体略微歪斜，像贴上去的
    const photo = photoIn(ctx, { x: 0.14, y: 0.13, w: 0.66, h: 0.53 })
    photo.rotation = -2
    layers.push(photo)

    // 右侧竖排小字，拼贴风常见
    layers.push(
      createTextLayer(texts.subtitle, { x: 0.85, y: 0.14, w: 0.1, h: 0.4 }, {
        name: '副标题',
        fontId: 'mono',
        fontSize: 0.024,
        fontWeight: 500,
        fill: solid('@accentText'),
        align: 'center',
        vertical: true,
      }),
    )

    // 标题左对齐、贴着色块边
    layers.push(
      createTextLayer(texts.title, { x: 0.06, y: 0.71, w: 0.88, h: 0.14 }, {
        name: '主标题',
        fontId: 'display',
        fontSize: fitFontSize(texts.title, 0.88, 0.13),
        fontWeight: 800,
        fill: solid('@textOnBg'),
        align: 'left',
        letterSpacing: -0.005,
        lineHeight: 1,
      }),
    )

    // 说明加个色块底，像贴纸标签
    layers.push(
      createTextLayer(texts.caption, { x: 0.07, y: 0.88, w: 0.55, h: 0.04 }, {
        name: '说明',
        fontId: 'mono',
        fontSize: 0.019,
        fontWeight: 500,
        fill: solid('@bg'),
        align: 'left',
        letterSpacing: 0.1,
        backdrop: { color: '@accent', padding: 0.012, radius: 0.004 },
      }),
    )

    return layers
  },
}

// ================================================================ 7. 复古胶片

const film: LayoutTemplate = {
  id: 'tpl_film',
  name: '复古胶片',
  tags: ['怀旧', '边框', '文艺'],
  builtin: true,
  createdAt: 0,
  meta: {
    idealAspect: 0.78,
    aspectTolerance: 0.4,
    subjectAnchor: 'center',
    textZones: [{ x: 0.12, y: 0.84, w: 0.76, h: 0.12 }],
    tonePreference: 'any',
  },
  build(ctx: BuildContext): Layer[] {
    const { texts } = ctx
    const layers: Layer[] = []

    layers.push(
      createShapeLayer('rect', { x: 0, y: 0, w: 1, h: 1 }, {
        name: '底色',
        fill: solid('@bg'),
      }),
    )

    // 照片带轻微褪色，胶片感的关键
    const photo = photoIn(ctx, { x: 0.1, y: 0.09, w: 0.8, h: 0.7 })
    photo.filters = {
      ...photo.filters,
      saturation: -0.22,
      contrast: -0.08,
      tint: 0.16,
      tintColor: '@accent',
    }
    layers.push(photo)

    // 照片四周细边框
    layers.push(
      createShapeLayer('rect', { x: 0.085, y: 0.078, w: 0.83, h: 0.724 }, {
        name: '照片边框',
        fill: null,
        stroke: { color: '@accent', width: 0.0022 },
      }),
    )

    // 左右打孔，模拟胶片齿孔
    for (let i = 0; i < 9; i++) {
      const y = 0.1 + i * 0.077
      for (const x of [0.032, 0.936]) {
        layers.push(
          createShapeLayer('rect', { x, y, w: 0.032, h: 0.032 }, {
            name: '齿孔',
            fill: solid('@surface'),
            radius: 0.22,
            opacity: 0.85,
          }),
        )
      }
    }

    layers.push(
      createTextLayer(texts.title, { x: 0.1, y: 0.83, w: 0.8, h: 0.075 }, {
        name: '主标题',
        fontId: 'serif',
        fontSize: fitFontSize(texts.title, 0.8, 0.068),
        fontWeight: 500,
        fill: solid('@textOnBg'),
        align: 'center',
        letterSpacing: 0.08,
      }),
    )

    layers.push(
      createTextLayer(texts.caption, { x: 0.1, y: 0.915, w: 0.8, h: 0.035 }, {
        name: '说明',
        fontId: 'mono',
        fontSize: 0.017,
        fontWeight: 400,
        fill: solid('@accentText'),
        align: 'center',
        letterSpacing: 0.22,
      }),
    )

    return layers
  },
}

// ================================================================ 8. 斜切分割

const diagonal: LayoutTemplate = {
  id: 'tpl_diagonal',
  name: '斜切分割',
  tags: ['动感', '几何', '潮流'],
  builtin: true,
  createdAt: 0,
  meta: {
    idealAspect: 0.72,
    aspectTolerance: 0.42,
    subjectAnchor: 'right',
    textZones: [{ x: 0.05, y: 0.6, w: 0.6, h: 0.3 }],
    tonePreference: 'any',
  },
  build(ctx: BuildContext): Layer[] {
    const { texts } = ctx
    const layers: Layer[] = []

    layers.push(photoIn(ctx, { x: 0, y: 0, w: 1, h: 1 }))

    // 左下角一个大斜三角压住，腾出文字空间
    layers.push(
      createShapeLayer('polygon', { x: -0.05, y: 0.4, w: 1.1, h: 0.65 }, {
        name: '斜切色块',
        fill: solid('@bg'),
        opacity: 0.92,
        // 相对 frame 的三个顶点：左上、左下、右下
        points: [
          [0, 0.42],
          [0, 1],
          [1, 1],
        ],
      }),
    )

    // 斜边上压一条点缀色细线，强调切割
    layers.push(
      createShapeLayer('line', { x: -0.05, y: 0.4, w: 1.1, h: 0.65 }, {
        name: '斜线',
        fill: null,
        stroke: { color: '@accent', width: 0.005 },
        points: [
          [0, 0.42],
          [1, 1],
        ],
      }),
    )

    layers.push(
      createTextLayer(texts.title, { x: 0.06, y: 0.66, w: 0.7, h: 0.14 }, {
        name: '主标题',
        fontId: 'display',
        fontSize: fitFontSize(texts.title, 0.7, 0.125),
        fontWeight: 800,
        fill: solid('@textOnBg'),
        align: 'left',
        lineHeight: 1,
      }),
    )

    layers.push(
      createTextLayer(texts.subtitle, { x: 0.06, y: 0.81, w: 0.7, h: 0.04 }, {
        name: '副标题',
        fontId: 'sans',
        fontSize: 0.022,
        fontWeight: 500,
        fill: solid('@accentText'),
        align: 'left',
        letterSpacing: 0.3,
      }),
    )

    layers.push(
      createTextLayer(texts.caption, { x: 0.06, y: 0.88, w: 0.7, h: 0.04 }, {
        name: '说明',
        fontId: 'sans',
        fontSize: 0.017,
        fontWeight: 400,
        fill: solid('@textOnBg'),
        align: 'left',
        letterSpacing: 0.2,
        opacity: 0.7,
      }),
    )

    return layers
  },
}

// ================================================================ 9. 对称构图

const symmetry: LayoutTemplate = {
  id: 'tpl_symmetry',
  name: '对称构图',
  tags: ['稳重', '仪式感', '居中'],
  builtin: true,
  createdAt: 0,
  meta: {
    idealAspect: 0.8,
    aspectTolerance: 0.35,
    subjectAnchor: 'center',
    textZones: [
      { x: 0.1, y: 0.06, w: 0.8, h: 0.1 },
      { x: 0.1, y: 0.86, w: 0.8, h: 0.1 },
    ],
    tonePreference: 'light',
  },
  build(ctx: BuildContext): Layer[] {
    const { texts } = ctx
    const layers: Layer[] = []

    layers.push(
      createShapeLayer('rect', { x: 0, y: 0, w: 1, h: 1 }, {
        name: '底色',
        fill: solid('@bg'),
      }),
    )

    // 拱门形照片，居中，上下对称留白
    const photo = photoIn(ctx, { x: 0.16, y: 0.19, w: 0.68, h: 0.62 })
    photo.mask = 'arch'
    layers.push(photo)

    // 拱门轮廓线
    layers.push(
      createShapeLayer('rect', { x: 0.145, y: 0.176, w: 0.71, h: 0.648 }, {
        name: '外框',
        fill: null,
        stroke: { color: '@accent', width: 0.0018 },
        radius: 0.02,
      }),
    )

    layers.push(
      createTextLayer(texts.subtitle, { x: 0.1, y: 0.075, w: 0.8, h: 0.04 }, {
        name: '副标题',
        fontId: 'sans',
        fontSize: 0.02,
        fontWeight: 400,
        fill: solid('@accentText'),
        align: 'center',
        letterSpacing: 0.55,
      }),
    )

    layers.push(
      createTextLayer(texts.title, { x: 0.08, y: 0.855, w: 0.84, h: 0.08 }, {
        name: '主标题',
        fontId: 'serif',
        fontSize: fitFontSize(texts.title, 0.84, 0.072),
        fontWeight: 500,
        fill: solid('@textOnBg'),
        align: 'center',
        letterSpacing: 0.1,
      }),
    )

    // 标题两侧对称短线
    for (const x of [0.16, 0.72]) {
      layers.push(
        createShapeLayer('rect', { x, y: 0.892, w: 0.12, h: 0.0016 }, {
          name: '装饰线',
          fill: solid('@accent'),
          opacity: 0.7,
        }),
      )
    }

    layers.push(
      createTextLayer(texts.caption, { x: 0.1, y: 0.935, w: 0.8, h: 0.035 }, {
        name: '说明',
        fontId: 'sans',
        fontSize: 0.016,
        fontWeight: 400,
        fill: solid('@textOnBg'),
        align: 'center',
        letterSpacing: 0.3,
        opacity: 0.65,
      }),
    )

    return layers
  },
}

// ================================================================ 10. 宝丽来

const polaroid: LayoutTemplate = {
  id: 'tpl_polaroid',
  name: '宝丽来',
  tags: ['即时成像', '手账', '可爱'],
  builtin: true,
  createdAt: 0,
  meta: {
    idealAspect: 0.95,
    aspectTolerance: 0.45,
    subjectAnchor: 'center',
    textZones: [{ x: 0.14, y: 0.76, w: 0.72, h: 0.14 }],
    tonePreference: 'any',
  },
  build(ctx: BuildContext): Layer[] {
    const { texts } = ctx
    const layers: Layer[] = []

    layers.push(
      createShapeLayer('rect', { x: 0, y: 0, w: 1, h: 1 }, {
        name: '底色',
        fill: solid('@surface'),
      }),
    )

    // 相纸：白色卡片，下方留出宽边（宝丽来的标志）
    layers.push(
      createShapeLayer('rect', { x: 0.1, y: 0.08, w: 0.8, h: 0.84 }, {
        name: '相纸',
        fill: solid('@bg'),
        radius: 0.012,
      }),
    )

    // 照片区在相纸上方，四周留等宽白边
    layers.push(photoIn(ctx, { x: 0.145, y: 0.125, w: 0.71, h: 0.6 }))

    // 手写感标题写在下方白边上
    layers.push(
      createTextLayer(texts.title, { x: 0.14, y: 0.765, w: 0.72, h: 0.07 }, {
        name: '主标题',
        fontId: 'kai',
        fontSize: fitFontSize(texts.title, 0.72, 0.062),
        fontWeight: 400,
        fill: solid('@textOnBg'),
        align: 'center',
        letterSpacing: 0.05,
      }),
    )

    layers.push(
      createTextLayer(texts.caption, { x: 0.14, y: 0.85, w: 0.72, h: 0.035 }, {
        name: '说明',
        fontId: 'mono',
        fontSize: 0.016,
        fontWeight: 400,
        fill: solid('@textOnBg'),
        align: 'center',
        letterSpacing: 0.15,
        opacity: 0.6,
      }),
    )

    // 右上角贴一小块胶带
    layers.push(
      createShapeLayer('rect', { x: 0.72, y: 0.03, w: 0.2, h: 0.055 }, {
        name: '胶带',
        rotation: -14,
        fill: solid('@accent'),
        opacity: 0.7,
      }),
    )

    return layers
  },
}

// ================================================================ 导出

export const BUILTIN_TEMPLATES: LayoutTemplate[] = [
  magazine,
  minimal,
  bold,
  cinema,
  concert,
  collage,
  film,
  diagonal,
  symmetry,
  polaroid,
]

export function getBuiltinTemplate(id: string): LayoutTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id)
}
