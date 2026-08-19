/**
 * 字体注册表。
 *
 * 阶段 1 先用系统字体栈跑通，阶段 3 再换成自托管子集化的中文字体
 * （思源黑体/思源宋体/得意黑等，都是可免费商用的开源字体）。
 * 结构提前定好，到时候只需要给 files 填上路径，UI 层不用改。
 *
 * 为什么不用 Google Fonts CDN：中文字体动辄几 MB，CDN 在国内不稳；
 * 而且导出图要求字体必须真的加载完成，走自己的域更可控。
 */

export interface FontDef {
  id: string
  /** 显示名。 */
  name: string
  /** CSS font-family，Konva 直接用这个值。 */
  family: string
  /** 分类，UI 里分组显示。 */
  category: 'sans' | 'serif' | 'display' | 'handwriting' | 'mono'
  /** 支持的字重。 */
  weights: number[]
  /** 是否含中文字形。不含的字体遇到中文会回退，UI 里要标注出来。 */
  cjk: boolean
  /**
   * 需要动态加载的字体文件。空数组 = 系统字体，无需加载。
   * 阶段 3 填充。
   */
  files: Array<{ weight: number; url: string }>
}

export const FONTS: FontDef[] = [
  {
    id: 'sans',
    name: '系统黑体',
    // 苹方 / 微软雅黑 / 思源黑体，按平台回退
    family:
      '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", "Hiragino Sans GB", sans-serif',
    category: 'sans',
    weights: [300, 400, 500, 700],
    cjk: true,
    files: [],
  },
  {
    id: 'serif',
    name: '系统宋体',
    family:
      '"Songti SC", "SimSun", "Noto Serif CJK SC", "Source Han Serif SC", "STSong", serif',
    category: 'serif',
    weights: [400, 500, 700],
    cjk: true,
    files: [],
  },
  {
    id: 'display',
    name: '系统粗黑',
    // 大字报用，优先挑最粗的系统字体
    family:
      '"PingFang SC", "Microsoft YaHei UI", "Noto Sans CJK SC", "Arial Black", sans-serif',
    category: 'display',
    weights: [700, 800, 900],
    cjk: true,
    files: [],
  },
  {
    id: 'kai',
    name: '系统楷体',
    family: '"Kaiti SC", "KaiTi", "STKaiti", "Noto Serif CJK SC", serif',
    category: 'handwriting',
    weights: [400],
    cjk: true,
    files: [],
  },
  {
    id: 'mono',
    name: '等宽',
    family: '"SF Mono", "Cascadia Mono", Consolas, "Courier New", monospace',
    category: 'mono',
    weights: [400, 700],
    cjk: false,
    files: [],
  },
  {
    id: 'latin-display',
    name: 'Latin 展示体',
    family: '"Impact", "Haettenschweiler", "Arial Black", sans-serif',
    category: 'display',
    weights: [400],
    cjk: false,
    files: [],
  },
]

export const FONT_CATEGORY_LABELS: Record<FontDef['category'], string> = {
  sans: '黑体',
  serif: '宋体 / 衬线',
  display: '展示 / 标题',
  handwriting: '手写 / 楷体',
  mono: '等宽',
}

const FONT_MAP = new Map(FONTS.map((f) => [f.id, f]))

export function getFont(id: string): FontDef {
  // 找不到就回退到系统黑体，不要让整张海报因为一个坏 fontId 渲染失败
  return FONT_MAP.get(id) ?? FONTS[0]
}

export function fontFamily(id: string): string {
  return getFont(id).family
}
