/**
 * 渐变几何。
 *
 * 单独成文件是为了让它可以被测试直接引入 —— 放在 LayerNode.tsx 里的话，
 * 测试会连带 import react-konva，而 konva 在 Node 环境需要原生 canvas 模块。
 */

export interface GradientAxis {
  start: { x: number; y: number }
  end: { x: number; y: number }
}

/**
 * 角度 -> Konva 线性渐变的起止点。0° = 从左到右，顺时针递增。
 *
 * 关键是渐变轴的长度：必须等于矩形在该方向上的投影长度
 * （|w·cosθ| + |h·sinθ|，也就是 CSS 的 gradient line length），
 * 而不是半对角线。用半对角线的话渐变会超出矩形范围 —— 矩形边缘处 alpha
 * 还没降到 0，于是渐隐层的边界会出现一条肉眼可见的硬边。
 */
export function gradientPoints(
  angleDeg: number,
  width: number,
  height: number,
): GradientAxis {
  const rad = (angleDeg * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)

  const length = Math.abs(width * dx) + Math.abs(height * dy)
  const cx = width / 2
  const cy = height / 2

  return {
    start: { x: cx - (dx * length) / 2, y: cy - (dy * length) / 2 },
    end: { x: cx + (dx * length) / 2, y: cy + (dy * length) / 2 },
  }
}

/** 色标数组转 Konva 需要的 [offset, color, offset, color, ...] 扁平格式。 */
export function flattenStops(
  stops: Array<{ offset: number; color: string }>,
): Array<number | string> {
  const out: Array<number | string> = []
  for (const s of stops) out.push(s.offset, s.color)
  return out
}
