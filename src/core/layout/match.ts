/**
 * 版型匹配打分。
 *
 * 给定一张照片的分析结果，给每个模板打分，选出最合适的。这是「自动出稿」
 * 里除配色外的另一半 —— 同样一张竖构图人像，套满版大字报和套拼贴风效果
 * 完全不同，选错了后面调半天也救不回来。
 *
 * 四项加权：
 *  - 宽高比契合（0.3）：竖图套横版模板一定会有大片空白或严重裁切。
 *  - 主体落点（0.3）：模板期望主体在下方，照片主体却在上方，文字就会压脸。
 *  - 文字区留白（0.3）：模板的文字区落在照片的密集区 = 字看不清。
 *  - 色调偏好（0.1）：弱信号，只做微调。
 */

import type { Frame, ImageAnalysis } from '../model/types'
import type { LayoutTemplate, SubjectAnchor } from './types'

export interface ScoredTemplate {
  template: LayoutTemplate
  score: number
  /** 各项分数，调试和「为什么推荐这个」的说明用。 */
  breakdown: {
    aspect: number
    subject: number
    space: number
    tone: number
  }
}

/** 各锚点期望的主体框（相对画布）。 */
const ANCHOR_FRAMES: Record<SubjectAnchor, Frame> = {
  center: { x: 0.2, y: 0.18, w: 0.6, h: 0.6 },
  top: { x: 0.2, y: 0.02, w: 0.6, h: 0.55 },
  bottom: { x: 0.2, y: 0.4, w: 0.6, h: 0.58 },
  left: { x: 0.02, y: 0.15, w: 0.55, h: 0.7 },
  right: { x: 0.43, y: 0.15, w: 0.55, h: 0.7 },
  full: { x: 0, y: 0, w: 1, h: 1 },
}

export function scoreTemplate(
  template: LayoutTemplate,
  analysis: ImageAnalysis,
): ScoredTemplate {
  const { meta } = template

  // --- 宽高比：用对数距离，这样 2:1 和 1:2 的偏离程度相等
  const ratio = Math.log(analysis.aspect / meta.idealAspect)
  const aspect = Math.exp(-(ratio * ratio) / (2 * meta.aspectTolerance ** 2))

  // --- 主体落点
  let subject: number
  if (meta.subjectAnchor === 'full') {
    // 满版模板不挑主体位置，但主体太小会显得空
    subject = Math.min(1, (analysis.subject.w * analysis.subject.h) / 0.25)
  } else {
    const expected = ANCHOR_FRAMES[meta.subjectAnchor]
    // 用中心距离而不是 IoU：主体框大小受显著性阈值影响较大，位置更可靠
    const ec = { x: expected.x + expected.w / 2, y: expected.y + expected.h / 2 }
    const sc = {
      x: analysis.subject.x + analysis.subject.w / 2,
      y: analysis.subject.y + analysis.subject.h / 2,
    }
    const dist = Math.hypot(ec.x - sc.x, ec.y - sc.y)
    subject = Math.exp(-(dist * dist) / (2 * 0.28 ** 2))
  }

  // --- 文字区留白
  let space = 1
  if (meta.textZones.length > 0) {
    let sum = 0
    for (const zone of meta.textZones) {
      sum += zoneEmptiness(zone, analysis.emptiness)
    }
    space = sum / meta.textZones.length
  }

  // --- 色调
  let tone = 0.6 // 中性基准，避免 'any' 模板白拿满分
  if (meta.tonePreference === 'any') {
    tone = 0.8
  } else if (meta.tonePreference === 'dark') {
    tone = analysis.luminance < 0.5 ? 1 : 0.4
  } else {
    tone = analysis.luminance >= 0.5 ? 1 : 0.4
  }

  const score = 0.3 * aspect + 0.3 * subject + 0.3 * space + 0.1 * tone

  return { template, score, breakdown: { aspect, subject, space, tone } }
}

/**
 * 查一个矩形区域在 3x3 留白网格上的平均留白度。
 * 按覆盖面积加权，跨格的区域会自然混合两格的值。
 */
function zoneEmptiness(zone: Frame, emptiness: number[]): number {
  let weighted = 0
  let totalArea = 0

  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const cell: Frame = { x: gx / 3, y: gy / 3, w: 1 / 3, h: 1 / 3 }
      const area = intersectArea(zone, cell)
      if (area <= 0) continue
      weighted += emptiness[gy * 3 + gx] * area
      totalArea += area
    }
  }

  return totalArea > 0 ? weighted / totalArea : 0.5
}

function intersectArea(a: Frame, b: Frame): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** 给全部模板打分并降序排列。 */
export function rankTemplates(
  templates: LayoutTemplate[],
  analysis: ImageAnalysis,
): ScoredTemplate[] {
  return templates
    .map((t) => scoreTemplate(t, analysis))
    .sort((a, b) => b.score - a.score)
}

/** 生成一句人话解释为什么推荐它，显示在推荐卡片上。 */
export function explainScore(scored: ScoredTemplate): string {
  const { breakdown } = scored
  const reasons: Array<[number, string]> = [
    [breakdown.aspect, '照片比例契合'],
    [breakdown.subject, '主体位置合适'],
    [breakdown.space, '留白够放文字'],
    [breakdown.tone, '色调相衬'],
  ]
  reasons.sort((a, b) => b[0] - a[0])
  return reasons[0][0] > 0.7 ? reasons[0][1] : '可以一试'
}
