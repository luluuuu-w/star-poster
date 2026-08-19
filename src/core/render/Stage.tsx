/**
 * 海报画布。
 *
 * 职责边界：
 * - 这里负责呈现（缩放适配、背景、图层渲染）和画布上的直接操作
 *   （选中、拖拽、缩放、旋转）。
 * - 变换结果通过 onTransform 回调交给上层写回模型，Stage 本身不碰 store，
 *   这样同一个组件也能用在只读预览和导出场景。
 */

import { forwardRef, useCallback, useEffect, useMemo, useRef } from 'react'
import { Group, Layer as KonvaLayer, Rect, Stage as KonvaStage, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { Frame, PosterDoc, TransformResult } from '../model/types'
import { resolveFill } from '../color/palette'
import { flattenLayers } from '../model/doc'
import { LayerNode, type RenderContext } from './nodes/LayerNode'
import { flattenStops, gradientPoints } from './gradient'
import { useImages } from './useImages'

export type { TransformResult }

export interface StageProps {
  doc: PosterDoc
  /** 画布在屏幕上的显示宽度（像素）。高度按文档宽高比推导。 */
  displayWidth: number
  selectedIds?: string[]
  onSelect?: (id: string | null, additive: boolean) => void
  /** 拖拽/缩放/旋转结束后调用，把新的几何写回模型。 */
  onTransform?: (id: string, result: TransformResult) => void
  /** 双击图层。用于文字的内联编辑。 */
  onDoubleClick?: (id: string) => void
  /** 是否显示分析结果叠加层（主体框 + 留白网格）。 */
  showAnalysis?: boolean
  interactive?: boolean
}

/** ref 暴露 Konva Stage 实例，导出功能需要拿它调 toBlob。 */
export const PosterStage = forwardRef<Konva.Stage, StageProps>(function PosterStage(
  {
    doc,
    displayWidth,
    selectedIds = [],
    onSelect,
    onTransform,
    onDoubleClick,
    showAnalysis = false,
    interactive = true,
  },
  ref,
) {
  const scale = displayWidth / doc.canvas.width
  const displayHeight = doc.canvas.height * scale

  const transformerRef = useRef<Konva.Transformer>(null)
  /** 图层 id -> Konva Group 节点。Transformer 要靠它找到目标。 */
  const nodesRef = useRef(new Map<string, Konva.Group>())

  const assetIds = useMemo(() => {
    const ids: string[] = []
    for (const l of flattenLayers(doc.layers)) {
      if (l.type === 'photo') ids.push(l.assetId)
    }
    return ids
  }, [doc.layers])

  const images = useImages(assetIds)

  // 渲染上下文用文档的原始画布尺寸，屏幕缩放交给 Stage 的 scale。
  // 这样模型层不需要知道当前显示多大，导出时换个 pixelRatio 就行
  const ctx: RenderContext = useMemo(
    () => ({
      width: doc.canvas.width,
      height: doc.canvas.height,
      palette: doc.palette,
      images,
    }),
    [doc.canvas.width, doc.canvas.height, doc.palette, images],
  )

  const registerNode = useCallback((id: string, node: Konva.Group | null) => {
    if (node) nodesRef.current.set(id, node)
    else nodesRef.current.delete(id)
  }, [])

  // 选中变化时把 Transformer 挂到对应节点上
  useEffect(() => {
    const tr = transformerRef.current
    if (!tr) return

    const nodes = selectedIds
      .map((id) => nodesRef.current.get(id))
      .filter((n): n is Konva.Group => Boolean(n))

    tr.nodes(nodes)
    tr.getLayer()?.batchDraw()
  }, [selectedIds, doc.layers])

  /** 拖拽结束：把 Group 的新位置换算回相对 frame。 */
  const handleDragEnd = useCallback(
    (id: string, node: Konva.Group) => {
      const layer = flattenLayers(doc.layers).find((l) => l.id === id)
      if (!layer || !onTransform) return

      // Group 的 x/y 是中心点（因为设了 offset），换算回左上角
      const w = layer.frame.w * doc.canvas.width
      const h = layer.frame.h * doc.canvas.height

      onTransform(id, {
        frame: {
          x: (node.x() - w / 2) / doc.canvas.width,
          y: (node.y() - h / 2) / doc.canvas.height,
          w: layer.frame.w,
          h: layer.frame.h,
        },
        rotation: layer.rotation,
      })
    },
    [doc.layers, doc.canvas.width, doc.canvas.height, onTransform],
  )

  /**
   * 变换结束：读出 scale 和 rotation 换算回模型，然后把节点的 scale 重置为 1。
   *
   * 必须重置 —— 模型是唯一真相，尺寸变化已经写进 frame 了。如果留着 scale，
   * 下次渲染会在新 frame 的基础上再乘一次，元素会越拖越大。
   */
  const handleTransformEnd = useCallback(
    (id: string, node: Konva.Group) => {
      const layer = flattenLayers(doc.layers).find((l) => l.id === id)
      if (!layer || !onTransform) return

      const sx = node.scaleX()
      const sy = node.scaleY()

      const newW = Math.max(0.005, layer.frame.w * Math.abs(sx))
      const newH = Math.max(0.005, layer.frame.h * Math.abs(sy))

      const wPx = newW * doc.canvas.width
      const hPx = newH * doc.canvas.height

      // 文字用角点等比缩放时，同时放大字号；用边中点拖拽则只改文本框
      let fontScale: number | undefined
      if (layer.type === 'text') {
        const anchor = transformerRef.current?.getActiveAnchor() ?? ''
        const isCorner = /top-left|top-right|bottom-left|bottom-right/.test(anchor)
        if (isCorner) fontScale = (Math.abs(sx) + Math.abs(sy)) / 2
      }

      onTransform(id, {
        frame: {
          x: (node.x() - wPx / 2) / doc.canvas.width,
          y: (node.y() - hPx / 2) / doc.canvas.height,
          w: newW,
          h: newH,
        },
        rotation: node.rotation(),
        fontScale,
      })

      node.scaleX(1)
      node.scaleY(1)
    },
    [doc.layers, doc.canvas.width, doc.canvas.height, onTransform],
  )

  const bg = resolveFill(doc.canvas.background, doc.palette)

  return (
    <KonvaStage
      ref={ref}
      width={displayWidth}
      height={displayHeight}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={(e) => {
        if (!interactive || !onSelect) return
        // 点到 Stage 本身说明没命中任何节点
        if (e.target === e.target.getStage()) onSelect(null, false)
      }}
      onDblClick={(e) => {
        if (!interactive || !onDoubleClick) return
        // 冒泡上来的 target 是具体子节点，往上找带 id 的祖先 Group
        let node: Konva.Node | null = e.target
        while (node && !node.id()) node = node.getParent()
        if (node?.id()) onDoubleClick(node.id())
      }}
    >
      <KonvaLayer>
        <Rect
          x={0}
          y={0}
          width={doc.canvas.width}
          height={doc.canvas.height}
          {...(bg.kind === 'solid'
            ? { fill: bg.color }
            : (() => {
                const { start, end } = gradientPoints(
                  bg.angle,
                  doc.canvas.width,
                  doc.canvas.height,
                )
                return {
                  fillLinearGradientStartPoint: start,
                  fillLinearGradientEndPoint: end,
                  fillLinearGradientColorStops: flattenStops(bg.stops),
                }
              })())}
          onMouseDown={() => {
            if (interactive) onSelect?.(null, false)
          }}
        />

        {doc.layers.map((layer) => (
          <LayerNode
            key={layer.id}
            layer={layer}
            ctx={ctx}
            onRef={registerNode}
            draggable={interactive}
            onSelect={interactive ? onSelect : undefined}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
          />
        ))}
      </KonvaLayer>

      {/* 参考线、分析叠加、Transformer 单独一层，避免和内容互相触发重绘 */}
      <KonvaLayer>
        {showAnalysis && doc.analysis && (
          <AnalysisOverlay
            subject={doc.analysis.subject}
            emptiness={doc.analysis.emptiness}
            width={doc.canvas.width}
            height={doc.canvas.height}
            scale={scale}
          />
        )}

        {interactive && (
          <Transformer
            ref={transformerRef}
            rotateEnabled
            keepRatio={false}
            // 手柄大小和线宽都要除以画布缩放，否则缩小画布时手柄会变得点不中
            anchorSize={9 / scale}
            anchorStroke="#4d9fff"
            anchorFill="#ffffff"
            anchorCornerRadius={2 / scale}
            borderStroke="#4d9fff"
            borderStrokeWidth={1.5 / scale}
            rotateAnchorOffset={26 / scale}
            // 不允许把元素拖成负尺寸（会翻转，行为很怪）
            boundBoxFunc={(_old, next) => ({
              ...next,
              width: Math.max(6, next.width),
              height: Math.max(6, next.height),
            })}
            // 旋转吸附到常用角度，方便摆正
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={4}
          />
        )}
      </KonvaLayer>
    </KonvaStage>
  )
})

/** 主体框 + 留白网格的可视化，帮用户理解自动排版的依据。 */
function AnalysisOverlay({
  subject,
  emptiness,
  width,
  height,
  scale,
}: {
  subject: Frame
  emptiness: number[]
  width: number
  height: number
  scale: number
}) {
  return (
    <Group listening={false}>
      {/* 留白网格：越绿越适合放字 */}
      {emptiness.map((v, i) => (
        <Rect
          key={i}
          x={((i % 3) * width) / 3}
          y={(Math.floor(i / 3) * height) / 3}
          width={width / 3}
          height={height / 3}
          fill={v > 0.6 ? '#3ddc84' : v > 0.35 ? '#ffc043' : '#ff5252'}
          opacity={0.16}
        />
      ))}
      {/* 检测到的主体框 */}
      <Rect
        x={subject.x * width}
        y={subject.y * height}
        width={subject.w * width}
        height={subject.h * height}
        stroke="#00e5ff"
        strokeWidth={2 / scale}
        dash={[10 / scale, 6 / scale]}
      />
    </Group>
  )
}
