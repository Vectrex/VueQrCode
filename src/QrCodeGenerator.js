import { stringToQrMatrix, defaultOptions } from './stringToQrMatrix.js'

const matrixToSvg = (matrix, options = {}) => {
  const mergedOptions = {...defaultOptions, ...options }
  const size = matrix.length
  const moduleSize = mergedOptions.moduleSize, gutter = mergedOptions.gutter
  const totalSize = (size + 2 * gutter) * moduleSize

  let path = ''
  for (let r = 0; r < size; ++r) {
    for (let c = 0; c < size; ++c) {
      if (matrix[r][c]) {
        let x = (c + gutter) * moduleSize, y = (r + gutter) * moduleSize
        path +=
          mergedOptions.svgAsPath ?
            `M${x},${y}h${moduleSize}v${moduleSize}h-${moduleSize}z` :
            `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" />`
      }
    }
  }

  const svg = mergedOptions.svgAsPath ? `<path d="${path}" fill="black" />` : `<g fill="black">${path}</g>`

  return `
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}"
        >
          <rect width="100%" height="100%" fill="white" />
          ${svg}
        </svg>`
}
const stringToQrCodeSVG = (text, options = {}) => matrixToSvg(stringToQrMatrix(text, options), options)
export { stringToQrCodeSVG }