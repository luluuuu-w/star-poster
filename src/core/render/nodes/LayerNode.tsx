/**
 * 图层 -> Konva 节点。
 *
 * 坐标约定：每个图层外面包一个 Group，Group 承担全部变换（位置、旋转、
 * 缩放），内部的子节点一律画在 **局部坐标系** (0,0)-(w,h) 里。
 *
 * 这样做的原因是 Transformer：Konva 的 Transformer 通过给目标节点设置
 * scaleX/scaleY/rotation 来实现拖拽缩放旋转。只有当「一个图层 = 一个可变换
 * 节点」时，才能把变换结果干净地读回模型。如果子节点自己带绝对坐标和旋转，
 * 变换会叠加，写回时几乎不可能算对。
 *
 * 这个文件只负责渲染，不含交互逻辑（选中/拖拽在 Stage.tsx）。
 */

import { Ellipse, Group, Image as KonvaImage, Line, Rect, Text } from 'react-konva'
import Konva from 'konva'
import { useEffect, useRef } from 'react'
import type {
  DecorLayer,
  Frame,
  Layer,
  Palette,
  PhotoLayer,
  ShapeLayer,
  StrokeLayer,
  TextLayer,
} from '../../model/types'
import { resolveColor, resolveFill, type ResolvedFill } from '../../color/palette'
import { fontFamily } from '../../fonts/registry'
import { flattenStops, gradientPoints } from '../gradient'
import { DecorNode } from './DecorNode'

export interface RenderContext {
  /** 画布像素尺寸。 */
  width: number
  height: number
  palette: Palette
  /** assetId -> 已解码的图片元素。 */
  images: Map<string, HTMLImageElement>
}

/** 相对 frame -> 像素矩形。 */
export function px(frame: Frame, ctx: RenderContext) {
  return {
    x: frame.x * ctx.width,
    y: frame.y * ctx.height,
    width: frame.w * ctx.width,
    height: frame.h * ctx.height,
  }
}

/** 相对长度 -> 像素。以短边为基准，保证横竖版视觉比例一致。 */
export function relToPx(v: number, ctx: RenderContext): number {
  return v * Math.min(ctx.width, ctx.height)
}

/** 把解析后的 Fill 转成 Konva 的填充属性。局部坐标系，所以从 (0,0) 起算。 */
function fillProps(
  fill: ResolvedFill | null,
  width: number,
  height: number,
): Record<string, unknown> {
  if (!fill) return { fill: undefined }

  if (fill.kind === 'solid') {
    return { fill: fill.color }
  }

  const { start, end } = gradientPoints(fill.angle, width, height)

  return {
    fillLinearGradientStartPoint: start,
    fillLinearGradientEndPoint: end,
    fillLinearGradientColorStops: flattenStops(fill.stops),
  }
}

// ---------------------------------------------------------------- 遮罩

/** 各遮罩形状的裁剪路径，局部坐标。 */
function clipFunc(
  mask: PhotoLayer['mask'],
  w: number,
  h: number,
  radius: number,
): ((c: Konva.Context) => void) | undefined {
  switch (mask) {
    case 'circle':
      return (c) => {
        c.beginPath()
        c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
        c.closePath()
      }
    case 'rounded': {
      const r = Math.min(w, h) * radius
      return (c) => {
        c.beginPath()
        c.moveTo(r, 0)
        c.arcTo(w, 0, w, h, r)
        c.arcTo(w, h, 0, h, r)
        c.arcTo(0, h, 0, 0, r)
        c.arcTo(0, 0, w, 0, r)
        c.closePath()
      }
    }
    case 'arch':
      // 上半圆 + 下方矩形，拱门形，写真常用
      return (c) => {
        const r = w / 2
        c.beginPath()
        c.moveTo(0, h)
        c.lineTo(0, r)
        c.arc(r, r, r, Math.PI, 0, false)
        c.lineTo(w, h)
        c.closePath()
      }
    case 'none':
    default:
      return undefined
  }
}

// ---------------------------------------------------------------- 照片

function PhotoBody({
  layer,
  w,
  h,
  ctx,
}: {
  layer: PhotoLayer
  w: number
  h: number
  ctx: RenderContext
}) {
  const imgRef = useRef<Konva.Image>(null)
  const img = ctx.images.get(layer.assetId)
  const f = layer.filters

  const needsFilter =
    f.brightness !== 0 || f.contrast !== 0 || f.saturation !== 0 || f.blur > 0

  /**
   * Konva 的 filters 必须配合 cache() 才生效，而且尺寸或参数变了要重新 cache。
   * 放在 effect 里而不是 ref 回调里，是因为参数变化时 ref 回调不会再触发。
   */
  useEffect(() => {
    const node = imgRef.current
    if (!node) return

    if (needsFilter && img) {
      node.cache()
    } else {
      node.clearCache()
    }
    node.getLayer()?.batchDraw()
  }, [needsFilter, img, w, h, f.brightness, f.contrast, f.saturation, f.blur])

  if (!img) {
    // 图还没解码好，先画个占位块，避免布局跳动
    return <Rect x={0} y={0} width={w} height={h} fill="#2a2a35" cornerRadius={4} />
  }

  // crop 是相对源图的比例，Konva 要源图像素坐标
  const crop = {
    x: layer.crop.x * img.naturalWidth,
    y: layer.crop.y * img.naturalHeight,
    width: layer.crop.w * img.naturalWidth,
    height: layer.crop.h * img.naturalHeight,
  }

  return (
    <>
      <KonvaImage
        ref={imgRef}
        image={img}
        crop={crop}
        x={0}
        y={0}
        width={w}
        height={h}
        {...(needsFilter
          ? {
              filters: buildFilters(f),
              brightness: f.brightness,
              // Konva 的 Contrast 滤镜取值范围是 -100~100
              contrast: f.contrast * 100,
              saturation: f.saturation,
              blurRadius: f.blur,
            }
          : {})}
      />
      {f.tint > 0 && (
        <Rect
          x={0}
          y={0}
          width={w}
          height={h}
          fill={resolveColor(f.tintColor, ctx.palette)}
          opacity={f.tint}
          // "color" 混合模式只替换色相饱和度、保留明度，正好是单色调染的效果
          globalCompositeOperation="color"
          listening={false}
        />
      )}
    </>
  )
}

function buildFilters(f: PhotoLayer['filters']) {
  const list: Array<(imageData: ImageData) => void> = []
  if (f.brightness !== 0) list.push(Konva.Filters.Brighten)
  if (f.contrast !== 0) list.push(Konva.Filters.Contrast)
  // HSL 滤镜负责饱和度，Konva 没有单独的饱和度滤镜
  if (f.saturation !== 0) list.push(Konva.Filters.HSL)
  if (f.blur > 0) list.push(Konva.Filters.Blur)
  return list
}

// ---------------------------------------------------------------- 形状

function ShapeBody({
  layer,
  w,
  h,
  ctx,
}: {
  layer: ShapeLayer
  w: number
  h: number
  ctx: RenderContext
}) {
  const fill = layer.fill ? resolveFill(layer.fill, ctx.palette) : null
  const fp = fillProps(fill, w, h)
  const strokeProps = layer.stroke
    ? {
        stroke: resolveColor(layer.stroke.color, ctx.palette),
        strokeWidth: relToPx(layer.stroke.width, ctx),
      }
    : {}

  switch (layer.shape) {
    case 'ellipse':
      return (
        <Ellipse
          x={w / 2}
          y={h / 2}
          radiusX={w / 2}
          radiusY={h / 2}
          {...fp}
          {...strokeProps}
        />
      )

    case 'triangle':
      return <Line points={[w / 2, 0, w, h, 0, h]} closed {...fp} {...strokeProps} />

    case 'line':
    case 'polygon': {
      const pts: number[] = []
      for (const [rx, ry] of layer.points) pts.push(rx * w, ry * h)
      // 没有点就退化成一条横线，避免画出一个不可见又选不中的空节点
      if (pts.length < 4) pts.push(0, h / 2, w, h / 2)

      return (
        <Line
          points={pts}
          closed={layer.shape === 'polygon'}
          lineCap="round"
          lineJoin="round"
          {...(layer.shape === 'polygon' ? fp : {})}
          {...(layer.stroke
            ? strokeProps
            : {
                stroke: fill && fill.kind === 'solid' ? fill.color : undefined,
                strokeWidth: relToPx(0.004, ctx),
              })}
        />
      )
    }

    case 'rect':
    default:
      return (
        <Rect
          x={0}
          y={0}
          width={w}
          height={h}
          cornerRadius={Math.min(w, h) * layer.radius}
          {...fp}
          {...strokeProps}
        />
      )
  }
}

// ---------------------------------------------------------------- 笔画

function StrokeBody({
  layer,
  w,
  h,
  ctx,
}: {
  layer: StrokeLayer
  w: number
  h: number
  ctx: RenderContext
}) {
  const pts: number[] = []
  for (const [rx, ry] of layer.points) pts.push(rx * w, ry * h)

  return (
    <Line
      points={pts}
      stroke={resolveColor(layer.color, ctx.palette)}
      strokeWidth={relToPx(layer.width, ctx)}
      lineCap="round"
      lineJoin="round"
      // Catmull-Rom 插值，手绘线条不会有折角
      tension={0.4}
      closed={layer.closed}
      fill={layer.fill ? resolveColor(layer.fill, ctx.palette) : undefined}
      // 细线很难点中，把命中区域放宽
      hitStrokeWidth={Math.max(relToPx(layer.width, ctx), 14)}
    />
  )
}

// ---------------------------------------------------------------- 文字

function TextBody({
  layer,
  w,
  h,
  ctx,
}: {
  layer: TextLayer
  w: number
  h: number
  ctx: RenderContext
}) {
  const fontSize = relToPx(layer.fontSize, ctx)
  const fill = resolveFill(layer.fill, ctx.palette)

  const textProps = {
    fontFamily: fontFamily(layer.fontId),
    fontSize,
    fontStyle: `${layer.italic ? 'italic ' : ''}${layer.fontWeight}`,
    // letterSpacing 存的是字号倍数，Konva 要像素
    letterSpacing: layer.letterSpacing * fontSize,
    lineHeight: layer.lineHeight,
    ...fillProps(fill, w, h),
    ...(layer.stroke
      ? {
          stroke: resolveColor(layer.stroke.color, ctx.palette),
          strokeWidth: relToPx(layer.stroke.width, ctx),
          // 先描边再填充，否则粗描边会吃掉字形内部细节
          fillAfterStrokeEnabled: true,
        }
      : {}),
    ...(layer.shadow
      ? {
          shadowColor: resolveColor(layer.shadow.color, ctx.palette),
          shadowBlur: relToPx(layer.shadow.blur, ctx),
          shadowOffsetX: relToPx(layer.shadow.dx, ctx),
          shadowOffsetY: relToPx(layer.shadow.dy, ctx),
        }
      : {}),
  }

  // Konva 没有原生竖排。中文竖排就是每个字一行，按字符拆开即可
  const body = layer.vertical ? (
    <Text
      {...textProps}
      text={[...layer.text].join('\n')}
      x={0}
      y={0}
      width={fontSize * 1.7}
      align="center"
      lineHeight={1.05}
    />
  ) : (
    <Text {...textProps} text={layer.text} x={0} y={0} width={w} align={layer.align} />
  )

  if (!layer.backdrop) return body

  const pad = relToPx(layer.backdrop.padding, ctx)
  return (
    <>
      <Rect
        x={-pad}
        y={-pad}
        width={w + pad * 2}
        height={h + pad * 2}
        fill={resolveColor(layer.backdrop.color, ctx.palette)}
        cornerRadius={relToPx(layer.backdrop.radius, ctx)}
      />
      {body}
    </>
  )
}

// ---------------------------------------------------------------- 分发

/**
 * 渲染一个图层。
 *
 * @param onRef 把外层 Group 的 Konva 节点交出去，Transformer 需要它。
 */
export function LayerNode({
  layer,
  ctx,
  onRef,
  draggable,
  onDragEnd,
  onTransformEnd,
  onSelect,
}: {
  layer: Layer
  ctx: RenderContext
  onRef?: (id: string, node: Konva.Group | null) => void
  draggable?: boolean
  onDragEnd?: (id: string, node: Konva.Group) => void
  onTransformEnd?: (id: string, node: Konva.Group) => void
  onSelect?: (id: string, additive: boolean) => void
}) {
  if (!layer.visible) return null

  const box = px(layer.frame, ctx)
  const { width: w, height: h } = box

  // 旋转以 frame 中心为轴：把节点原点放到中心，再用 offset 抵消回左上
  const groupProps = {
    id: layer.id,
    x: box.x + w / 2,
    y: box.y + h / 2,
    offsetX: w / 2,
    offsetY: h / 2,
    width: w,
    height: h,
    rotation: layer.rotation,
    opacity: layer.opacity,
    globalCompositeOperation:
      layer.blendMode === 'normal'
        ? undefined
        : (layer.blendMode as GlobalCompositeOperation),
    listening: !layer.locked,
    draggable: draggable && !layer.locked,
  }

  let body: React.ReactNode
  switch (layer.type) {
    case 'photo':
      body = <PhotoBody layer={layer} w={w} h={h} ctx={ctx} />
      break
    case 'shape':
      body = <ShapeBody layer={layer} w={w} h={h} ctx={ctx} />
      break
    case 'stroke':
      body = <StrokeBody layer={layer} w={w} h={h} ctx={ctx} />
      break
    case 'text':
      body = <TextBody layer={layer} w={w} h={h} ctx={ctx} />
      break
    case 'decor':
      body = <DecorNode layer={layer as DecorLayer} w={w} h={h} ctx={ctx} />
      break
    case 'group':
      body = layer.children.map((child) => (
        // 子图层的 frame 仍然是相对整个画布的，所以要抵消掉父 Group 的位移
        <Group key={child.id} x={-box.x} y={-box.y}>
          <LayerNode layer={child} ctx={ctx} />
        </Group>
      ))
      break
    default:
      return null
  }

  const clip =
    layer.type === 'photo'
      ? clipFunc(layer.mask, w, h, layer.maskRadius)
      : undefined

  return (
    <Group
      {...groupProps}
      {...(clip ? { clipFunc: clip } : {})}
      ref={(node) => onRef?.(layer.id, node)}
      onMouseDown={(e) => {
        if (!onSelect) return
        e.cancelBubble = true // 别冒到 Stage 触发「点空白取消选中」
        onSelect(layer.id, e.evt.shiftKey)
      }}
      onTap={(e) => {
        if (!onSelect) return
        e.cancelBubble = true
        onSelect(layer.id, false)
      }}
      onDragEnd={(e) => onDragEnd?.(layer.id, e.target as Konva.Group)}
      onTransformEnd={(e) => onTransformEnd?.(layer.id, e.target as Konva.Group)}
    >
      {body}
    </Group>
  )
}
