/**
 * 生成 e2e 用的测试图。
 *
 * 三张风格差异明显的合成「人像」：暖调、冷调夜景、高调白背景。
 * 用合成图而不是真人照片，是为了让断言可预测 —— 我们知道每张图的主色
 * 应该是什么、主体在哪。
 */

import { deflateSync } from 'node:zlib'

/** 最小 PNG 编码器。只支持 8 位 RGBA，够测试用。 */
function encodePNG(width, height, rgba) {
  const chunks = []

  // 每行前面要加一个 filter 类型字节，这里统一用 0（无过滤）
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  chunks.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  chunks.push(chunk('IHDR', ihdr))
  chunks.push(chunk('IDAT', deflateSync(raw)))
  chunks.push(chunk('IEND', Buffer.alloc(0)))

  return Buffer.concat(chunks)
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * 画一张合成人像。
 * @param spec.bg 背景色
 * @param spec.skin 主体色
 * @param spec.subject 主体框（相对 0~1）
 */
function synthPortrait(width, height, spec) {
  const rgba = Buffer.alloc(width * height * 4)

  const sx0 = spec.subject.x * width
  const sx1 = (spec.subject.x + spec.subject.w) * width
  const sy0 = spec.subject.y * height
  const sy1 = (spec.subject.y + spec.subject.h) * height
  const cx = (sx0 + sx1) / 2
  const headR = (sx1 - sx0) * 0.34

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      let [r, g, b] = spec.bg

      // 背景加一点垂直渐变，避免全纯色（真实照片不会是纯色背景）。
      // 系数取 0.88~1.0 而不是跨过 1，免得亮背景被 clamp 成一片死白，
      // 那样就测不出取色对渐变背景的处理了
      const t = y / height
      const k = 0.88 + t * 0.12
      r = clamp(r * k)
      g = clamp(g * k)
      b = clamp(b * k)

      // 头部：圆形
      const headCy = sy0 + headR * 1.1
      const inHead = (x - cx) ** 2 + (y - headCy) ** 2 < headR ** 2

      // 身体：从肩膀往下的梯形
      const shoulderY = headCy + headR * 1.15
      const inBody =
        y >= shoulderY &&
        y < sy1 &&
        Math.abs(x - cx) < (sx1 - sx0) * (0.28 + ((y - shoulderY) / (sy1 - shoulderY)) * 0.22)

      if (inHead || inBody) {
        // 主体内部加纹理，制造边缘信号
        const n = (((x * 7 + y * 13) % 23) - 11) * 1.6
        r = clamp(spec.skin[0] + n)
        g = clamp(spec.skin[1] + n)
        b = clamp(spec.skin[2] + n)

        // 头发/上半部压暗一点，增加内部对比
        if (inHead && y < headCy - headR * 0.25) {
          r = clamp(r * 0.45)
          g = clamp(g * 0.4)
          b = clamp(b * 0.4)
        }
        // 衣服用点缀色
        if (inBody && spec.cloth) {
          r = clamp(spec.cloth[0] + n)
          g = clamp(spec.cloth[1] + n)
          b = clamp(spec.cloth[2] + n)
        }
      }

      rgba[i] = r
      rgba[i + 1] = g
      rgba[i + 2] = b
      rgba[i + 3] = 255
    }
  }

  return encodePNG(width, height, rgba)
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))

export const PNG_FIXTURES = [
  {
    name: 'warm-portrait',
    desc: '暖调人像，竖构图，主体居中偏上',
    // 暗暖底 -> 背景应该是深色，且不能偏冷
    expect: { bgTone: 'dark', bgHue: 'warm' },
    base64: synthPortrait(600, 800, {
      bg: [58, 34, 24],
      skin: [226, 176, 140],
      cloth: [176, 74, 48],
      subject: { x: 0.24, y: 0.14, w: 0.52, h: 0.7 },
    }).toString('base64'),
  },
  {
    name: 'cool-night',
    desc: '冷调夜景，暗背景，高饱和点缀',
    expect: { bgTone: 'dark', bgHue: 'cool' },
    base64: synthPortrait(600, 800, {
      bg: [16, 26, 46],
      skin: [188, 196, 214],
      cloth: [36, 132, 186],
      subject: { x: 0.28, y: 0.1, w: 0.46, h: 0.76 },
    }).toString('base64'),
  },
  {
    name: 'high-key',
    desc: '高调白背景，浅色，主体对比强',
    // 亮暖底 -> 背景应该是浅色，且不能偏冷
    expect: { bgTone: 'light', bgHue: 'warm' },
    base64: synthPortrait(700, 700, {
      bg: [242, 238, 232],
      skin: [214, 168, 134],
      cloth: [46, 44, 52],
      subject: { x: 0.3, y: 0.12, w: 0.42, h: 0.78 },
    }).toString('base64'),
  },
]
