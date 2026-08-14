import sharp from "sharp";
import { PREVIEW_MAX_EDGE, WATERMARK_TEXT } from "@/lib/constants";

/**
 * 生成带水印的站内预览图：
 * - 最长边缩放到 PREVIEW_MAX_EDGE（800px），保持比例、不拉伸
 * - 原图最长边不足 800px 时不放大
 * - 水印（半透明斜向重复文字）真正写入图片文件
 */
export async function createWatermarkedPreview(
  input: Buffer
): Promise<Buffer> {
  const img = sharp(input);
  const meta = await img.metadata();
  const width = meta.width || 1;
  const height = meta.height || 1;

  // 计算目标尺寸（只缩不放）
  let targetW = width;
  let targetH = height;
  if (Math.max(width, height) > PREVIEW_MAX_EDGE) {
    const scale = PREVIEW_MAX_EDGE / Math.max(width, height);
    targetW = Math.max(1, Math.round(width * scale));
    targetH = Math.max(1, Math.round(height * scale));
  }

  // 缩放到目标尺寸（保持比例）
  let output = await img
    .resize(targetW, targetH, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // 生成斜向重复水印 SVG 并合成到图片上
  const watermarkSvg = buildWatermarkSvg(targetW, targetH);
  output = await sharp(output)
    .composite([
      {
        input: Buffer.from(watermarkSvg),
        gravity: "center",
      },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();

  return output;
}

/** 生成斜向重复半透明水印 SVG */
function buildWatermarkSvg(w: number, h: number): string {
  const text = WATERMARK_TEXT;
  const fontSize = Math.max(24, Math.round(w / 24));
  const spacing = Math.max(140, fontSize * 3.2);
  const texts: string[] = [];
  // 覆盖整个画布的斜向重复
  for (let y = -h; y < h * 2; y += spacing) {
    for (let x = -w; x < w * 2; x += spacing * 1.6) {
      texts.push(
        `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="bold" fill="rgba(255,255,255,0.22)">${text}</text>`
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <pattern id="diag" width="1" height="1" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <rect width="1" height="1" fill="rgba(0,0,0,0.18)"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#diag)"/>
  <g transform="rotate(-30 ${w / 2} ${h / 2})">${texts.join("")}</g>
</svg>`;
}
