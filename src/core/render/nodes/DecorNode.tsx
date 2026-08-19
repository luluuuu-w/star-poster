/**
 * 装饰渲染。
 *
 * 装饰内部坐标统一是 100x100，这里缩放到实例的尺寸。这样同一个装饰
 * 拉大拉小、放在任何位置都不用改定义。
 *
 * 和其他 *Body 组件一样，这里画在局部坐标系 (0,0)-(w,h) 里，
 * 外层 Group 负责位置和旋转。
 */

import { Circle, Group, Image as KonvaImage, Line, Path, Rect } from 'react-konva'
import type { DecorElement, DecorLayer, Decoration } from '../../model/types'
import { resolveColor } from '../../color/palette'
import { getDecoration } from '../../../assets/decorations'
import type { RenderContext } from './LayerNode'

const DECOR_SPACE = 100

export function DecorNode({
  layer,
  w,
  h,
  ctx,
}: {
  layer: DecorLayer
  w: number
  h: number
  ctx: RenderContext
}) {
  const decoration = getDecoration(layer.decorId)

  if (!decoration) {
    // 装饰定义找不到（比如引用了已删除的自定义装饰）。画一个虚线框提示，
    // 而不是静默消失 —— 否则用户会以为图层坏了却看不出原因
    return (
      <Rect
        x={0}
        y={0}
        width={w}
        height={h}
        stroke="#ff5f6d"
        strokeWidth={1.5}
        dash={[6, 4]}
        listening={false}
      />
    )
  }

  const sx = w / DECOR_SPACE
  const sy = h / DECOR_SPACE

  return (
    <Group
      // 翻转靠负 scale 实现，再用 offset 把图形推回原位
      scaleX={layer.flipX ? -sx : sx}
      scaleY={layer.flipY ? -sy : sy}
      x={layer.flipX ? w : 0}
      y={layer.flipY ? h : 0}
    >
      {decoration.elements.map((el, i) => (
        <DecorElementNode key={i} el={el} decoration={decoration} layer={layer} ctx={ctx} />
      ))}
    </Group>
  )
}

function DecorElementNode({
  el,
  decoration,
  layer,
  ctx,
}: {
  el: DecorElement
  decoration: Decoration
  layer: DecorLayer
  ctx: RenderContext
}) {
  /**
   * 色位解析顺序：图层实例的覆盖 -> 装饰自己的默认值 -> 当作字面颜色。
   * 这个顺序让「同一个装饰放两次、各用不同颜色」成为可能。
   */
  const color = (slot: string | undefined): string | undefined => {
    if (!slot) return undefined
    const ref = layer.colors[slot] ?? decoration.palette[slot] ?? slot
    return resolveColor(ref, ctx.palette)
  }

  // 装饰内部线宽是 100x100 空间里的值，Group 的 scale 会自动带上
  switch (el.kind) {
    case 'path':
      return (
        <Path
          data={el.d}
          fill={color(el.fill)}
          stroke={color(el.stroke)}
          strokeWidth={el.strokeWidth}
          opacity={el.opacity ?? 1}
          listening={false}
        />
      )

    case 'circle':
      return (
        <Circle
          x={el.cx}
          y={el.cy}
          radius={el.r}
          fill={color(el.fill)}
          stroke={color(el.stroke)}
          strokeWidth={el.strokeWidth}
          opacity={el.opacity ?? 1}
          listening={false}
        />
      )

    case 'rect':
      return (
        <Rect
          x={el.x}
          y={el.y}
          width={el.w}
          height={el.h}
          cornerRadius={el.rx}
          rotation={el.rotation}
          fill={color(el.fill)}
          stroke={color(el.stroke)}
          strokeWidth={el.strokeWidth}
          opacity={el.opacity ?? 1}
          listening={false}
        />
      )

    case 'line':
      return (
        <Line
          points={el.points}
          stroke={color(el.stroke)}
          strokeWidth={el.strokeWidth}
          dash={el.dash}
          opacity={el.opacity ?? 1}
          lineCap="round"
          listening={false}
        />
      )

    case 'image': {
      // 用户导入的位图。图还没解码就先不画，等 images 就位后重渲染
      const img = ctx.images.get(el.assetId)
      if (!img) return null
      return (
        <KonvaImage
          image={img}
          x={el.x}
          y={el.y}
          width={el.w}
          height={el.h}
          opacity={el.opacity ?? 1}
          listening={false}
        />
      )
    }

    default:
      return null
  }
}
