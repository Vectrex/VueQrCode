/*
 * QR Code generator heavily based on the work of
 * https://github.com/kazuhikoarase/qrcode-generator
 */

const MIN_VERSION = 1
const MAX_VERSION = 40
const PENALTY_N1 = 3
const PENALTY_N2 = 3
const PENALTY_N3 = 40
const PENALTY_N4 = 10

const ECC_CODEWORDS_PER_BLOCK = [
  [-1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
]
const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4,  4,  4,  4,  4,  6,  6,  6,  6,  7,  8,  8,  9,  9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5,  5,  8,  9,  9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8,  8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
]
const ECC = {
  L: { ordinal: 0, formatBits: 1 },
  M: { ordinal: 1, formatBits: 0 },
  Q: { ordinal: 2, formatBits: 3 },
  H: { ordinal: 3, formatBits: 2 },
}
const SEGMENT_MODE = {
  numeric: { modeBits: 0x1, numBitsCharCount: [10, 12, 14] },
  alphanumeric: { modeBits: 0x2, numBitsCharCount: [9, 11, 13] },
  byte: { modeBits: 0x4, numBitsCharCount: [8, 16, 16] },
  kanji: { modeBits: 0x8, numBitsCharCount: [8, 10, 12] },
  eci: { modeBits: 0x7, numBitsCharCount: [0, 0, 0] },
}

const defaultOptions = {
  minVersion: 1,
  maxVersion: 40,
  mask: -1,
  boostEcl: true,
  ecl: 'M'
}

const isNumeric = text => /^[0-9]*$/.test(text)
const isAlphanumeric = text => /^[A-Z0-9 $%*+.\/:-]*$/.test(text)
const getBit = (x, i) => ((x >>> i) & 1) !== 0
const appendBits = (val, len, bb) => {
  if (len < 0 || len > 31 || val >>> len !== 0) throw new RangeError("Value out of range")
  for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1)
}
const getNumRawDataModules = (ver) => {
  if (ver < MIN_VERSION || ver > MAX_VERSION) throw new RangeError("Version number out of range")
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2
    result -= (25 * numAlign - 10) * numAlign - 55
    if (ver >= 7) result -= 36
  }
  assert(208 <= result && result <= 29648)
  return result
}
const getNumDataCodewords = (ver, ecl) => Math.floor(getNumRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver]
const getTotalBits = (segments, version) => {
  let result = 0
  for (const seg of segments) {
    const ccBits = seg.mode.numBitsCharCount[Math.floor((version + 7) / 17)]
    if (seg.numChars >= (1 << ccBits)) return Infinity
    result += 4 + ccBits + seg.bitData.length
  }
  return result
}
const reedSolomonMultiply = (x, y) => {
  if (x >>> 8 !== 0 || y >>> 8 !== 0) throw new RangeError("Byte out of range")
  let z = 0
  for (let i = 7; i >= 0; --i) {
    z = (z << 1) ^ ((z >>> 7) * 0x11D);
    z ^= ((y >>> i) & 1) * x;
  }
  assert(z >>> 8 === 0)
  return z
}
const reedSolomonComputeDivisor = degree => {
  if (degree < 1 || degree > 255) throw new RangeError("Degree out of range")
  let result = [...Array(degree - 1).fill(0), 1]
  for (let i = 0, root = 1; i < degree; ++i) {
    for (let j = 0; j < result.length; ++j) {
      result[j] = reedSolomonMultiply(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = reedSolomonMultiply(root, 0x02)
  }
  return result
}
const reedSolomonComputeRemainder = (data, divisor) => {
  let result = divisor.map(() => 0)
  for (const b of data) {
    const factor = b ^ result.shift()
    result.push(0)
    divisor.forEach((c, i) => result[i] ^= reedSolomonMultiply(c, factor))
  }
  return result
}
const makeBytes = bytes => {
  let bb = []
  // const data = toUtf8ByteArray(bytes)
  const data = (new TextEncoder).encode(bytes)
  for (const b of data) appendBits(b, 8, bb)

  return [{
    mode: SEGMENT_MODE.byte,
    numChars: data.length,
    bitData: [...bb]
  }]
}
const makeSegments = text => {
  if (!text) return []
  let bb = []
  if (isNumeric(text)) {
    for (let i = 0; i < text.length; ) {
      const n = Math.min(text.length - i, 3)
      appendBits(parseInt(text.substring(i, i + n), 10), n * 3 + 1, bb)
      i += n
    }
    return [{
      mode: SEGMENT_MODE.numeric,
      numChars: text.length,
      bitData: [...bb]
    }]
  }
  if (isAlphanumeric(text)) {
    let i, alnumChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'
    for (i = 0; i + 2 <= text.length; i += 2) {
      let temp = alnumChars.indexOf(text.charAt(i)) * 45
      temp += alnumChars.indexOf(text.charAt(i + 1))
      appendBits(temp, 11, bb)
    }
    if (i < text.length) appendBits(alnumChars.indexOf(text.charAt(i)), 6, bb)
    return [{
      mode: SEGMENT_MODE.alphanumeric,
      numChars: text.length,
      bitData: [...bb]
    }]
  }
  return makeBytes(text)
}
const encodeSegments = (segments, ecl, minVersion = 1, maxVersion = 40, mask = -1, boostEcl = true) => {
  if (!(MIN_VERSION <= minVersion && minVersion <= maxVersion && maxVersion <= MAX_VERSION) || mask < -1 || mask > 7) throw new RangeError('Invalid value')

  let version, dataUsedBits

  ecl = ECC[ecl]
  for (version = minVersion; ; ++version) {
    const dataCapacityBits = getNumDataCodewords(version, ecl) * 8
    const usedBits = getTotalBits(segments, version)
    if (usedBits <= dataCapacityBits) {
      dataUsedBits = usedBits
      break
    }
    if (version >= maxVersion) throw new RangeError('Data too long')
  }
  for (const newEcl of [ECC.M, ECC.Q, ECC.H]) {
    if (boostEcl && dataUsedBits <= getNumDataCodewords(version, newEcl) * 8) ecl = newEcl
  }

  let bb = []
  for (const seg of segments) {
    appendBits(seg.mode.modeBits, 4, bb)
    appendBits(seg.numChars, seg.mode.numBitsCharCount[Math.floor((version + 7) / 17)], bb)
    for (const b of [...seg.bitData]) bb.push(b)
  }
  assert(bb.length === dataUsedBits)

  const dataCapacityBits = getNumDataCodewords(version, ecl) * 8
  assert(bb.length <= dataCapacityBits)
  appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb)
  appendBits(0, (8 - bb.length % 8) % 8, bb)
  assert(bb.length % 8 === 0)

  for (let padByte = 0xEC; bb.length < dataCapacityBits; padByte ^= 0xEC ^ 0x11) appendBits(padByte, 8, bb)
  const dataCodewords = [];
  while (dataCodewords.length * 8 < bb.length) dataCodewords.push(0)
  bb.forEach((b, i) => dataCodewords[i >>> 3] |= b << (7 - (i & 7)))
  return { version, dataCodewords, ecl }
}
const assert = cond => { if (!cond) throw new Error('Assertion error') }

const render = (segments, options) => {

  const { version, dataCodewords, ecl } = encodeSegments(segments, options.ecl, options.minVersion, options.maxVersion, options.mask, options.boostEcl)
  if (version < MIN_VERSION || version > MAX_VERSION) throw new RangeError('Version value out of range')
  const size = version * 4 + 17

  const modules = []
  const isFunction = []

  const row = Array(size).fill(false)
  for (let i = size; i--;) {
    modules.push([...row])
    isFunction.push([...row])
  }

  const setFunctionModule = (x, y, isDark) => {
    modules[y][x] = isDark
    isFunction[y][x] = true
  }
  const drawFinderPattern = (x, y) => {
    for (let dy = -4; dy <= 4; ++dy) {
      for (let dx = -4; dx <= 4; ++dx) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        const xx = x + dx, yy = y + dy
        if (0 <= xx && xx < size && 0 <= yy && yy < size) setFunctionModule(xx, yy, dist !== 2 && dist !== 4)
      }
    }
  }
  const getAlignmentPatternPositions = () => {
    if (version === 1) return []
    const numAlign = Math.floor(version / 7) + 2
    const step = Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2
    let result = [6]
    for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos)
    return result
  }
  const drawAlignmentPattern = (x, y) => {
    for (let dy = -2; dy <= 2; ++dy) {
      for (let dx = -2; dx <= 2; ++dx) setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  }
  const drawFormatBits = mask => {
    const data = (ecl.formatBits << 3) | mask
    let rem = data
    for (let i = 0; i < 10; ++i) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const bits = ((data << 10) | rem) ^ 0x5412
    assert(bits >>> 15 === 0)
    for (let i = 0; i <= 5; ++i) setFunctionModule(8, i, getBit(bits, i))
    setFunctionModule(8, 7, getBit(bits, 6))
    setFunctionModule(8, 8, getBit(bits, 7))
    setFunctionModule(7, 8, getBit(bits, 8))
    for (let i = 9; i < 15; ++i) setFunctionModule(14 - i, 8, getBit(bits, i))
    for (let i = 0; i < 8; ++i) setFunctionModule(size - 1 - i, 8, getBit(bits, i))
    for (let i = 8; i < 15; ++i) setFunctionModule(8, size - 15 + i, getBit(bits, i))
    setFunctionModule(8, size - 8, true)
  }
  const drawCodewords = data => {
    if (data.length !== Math.floor(getNumRawDataModules(version) / 8)) throw new RangeError('Invalid argument')
    let i = 0
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let vert = 0; vert < size; ++vert) {
        for (let j = 0; j < 2; ++j) {
          const x = right - j
          const upward = ((right + 1) & 2) === 0
          const y = upward ? size - 1 - vert : vert
          if (!isFunction[y][x] && i < data.length * 8) {
            modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7))
            ++i
          }
        }
      }
    }
    assert(i === data.length * 8)
  }

  const addEccAndInterleave = data => {
    if (data.length !== getNumDataCodewords(version, ecl)) throw new RangeError('Invalid argument')

    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][version]
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][version]
    const rawCodewords = Math.floor(getNumRawDataModules(version) / 8)
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks)
    const shortBlockLen = Math.floor(rawCodewords / numBlocks)
    const blocks = []
    const rsDiv = reedSolomonComputeDivisor(blockEccLen)

    for (let i = 0, k = 0; i < numBlocks; ++i) {
      let dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1))
      k += dat.length
      const ecc = reedSolomonComputeRemainder(dat, rsDiv)
      if (i < numShortBlocks) dat.push(0)
      blocks.push(dat.concat(ecc))
    }

    let result = []
    for (let i = 0; i < blocks[0].length; ++i) {
      blocks.forEach((block, j) => { if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]) })
    }
    assert(result.length === rawCodewords)
    return result
  }

  const applyMask = mask => {
    const maskFn = [
      (x, y) => (x + y) % 2 === 0,
      (x, y) => y % 2 === 0,
      (x, _) => x % 3 === 0,
      (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => x * y % 2 + x * y % 3 === 0,
      (x, y) => (x * y % 2 + x * y % 3) % 2 === 0,
      (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0,
    ][mask]
    for (let y = 0; y < size; ++y) {
      for (let x = 0; x < size; ++x) {
        if (!isFunction[y][x] && maskFn(x, y)) modules[y][x] = !modules[y][x]
      }
    }
  }

  const finderPenaltyAddHistory = (currentRunLength, runHistory) => {
    if (runHistory[0] === 0) currentRunLength += size
    runHistory.pop()
    runHistory.unshift(currentRunLength)
  }
  const finderPenaltyCountPatterns = runHistory => {
    const n = runHistory[1]
    assert(n <= size * 3)
    const core = n > 0 && runHistory[2] === n && runHistory[3] === n * 3 && runHistory[4] === n && runHistory[5] === n
    return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) + (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0)
  }
  const finderPenaltyTerminateAndCount = (currentRunColor, currentRunLength, runHistory) => {
    if (currentRunColor) {
      finderPenaltyAddHistory(currentRunLength, runHistory)
      currentRunLength = 0
    }
    currentRunLength += size
    finderPenaltyAddHistory(currentRunLength, runHistory)
    return finderPenaltyCountPatterns(runHistory)
  }
  const getPenaltyScore = () => {
    let result = 0

    // 5 or more modules of the same color in a column, or patterns similar to finder patterns (1:1:3:1:1)

    for (let y = 0; y < size; ++y) {
      let runColor = false
      let runX = 0
      let runHistory = Array(7).fill(0)
      for (let x = 0; x < size; ++x) {
        if (modules[y][x] === runColor) {
          ++runX
          if (runX === 5) {
            result += PENALTY_N1
          } else if (runX > 5) {
            ++result
          }
        } else {
          finderPenaltyAddHistory(runX, runHistory)
          if (!runColor) result += finderPenaltyCountPatterns(runHistory) * PENALTY_N3
          runColor = modules[y][x]
          runX = 1
        }
      }
      result += finderPenaltyTerminateAndCount(runColor, runX, runHistory) * PENALTY_N3
    }

    // 5 or more modules of the same color in a column, or patterns similar to finder patterns (1:1:3:1:1)

    for (let x = 0; x < size; ++x) {
      let runColor = false
      let runY = 0
      let runHistory = Array(7).fill(0)
      for (let y = 0; y < size; ++y) {
        if (modules[y][x] === runColor) {
          ++runY
          if (runY === 5) result += PENALTY_N1
          else if (runY > 5) result++
        } else {
          finderPenaltyAddHistory(runY, runHistory)
          if (!runColor) result += finderPenaltyCountPatterns(runHistory) * PENALTY_N3
          runColor = modules[y][x]
          runY = 1
        }
      }
      result += finderPenaltyTerminateAndCount(runColor, runY, runHistory) * PENALTY_N3
    }

    // 2 x 2 blocks of the same color

    for (let y = 0; y < size - 1; ++y) {
      for (let x = 0; x < size - 1; ++x) {
        const c = modules[y][x]
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) result += PENALTY_N2
      }
    }

    // ratio of dark modules to total modules

    let dark = 0
    for (const row of modules) {
      dark = row.reduce((sum, color) => sum + (color ? 1 : 0), dark)
    }
    const total = size * size
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1
    assert(0 <= k && k <= 9)
    result += k * PENALTY_N4
    return result
  }

  // draw function patterns

  for (let i = 0; i < size; ++i) {
    setFunctionModule(6, i, i % 2 === 0)
    setFunctionModule(i, 6, i % 2 === 0)
  }

  // draw finder patterns

  drawFinderPattern(3, 3)
  drawFinderPattern(size - 4, 3)
  drawFinderPattern(3, size - 4)

  // draw alignment pattern

  const alignPatPos = getAlignmentPatternPositions()
  const numAlign = alignPatPos.length;
  for (let i = 0; i < numAlign; ++i) {
    for (let j = 0; j < numAlign; ++j) {
      if (!(i === 0 && j === 0 || i === 0 && j === numAlign - 1 || i === numAlign - 1 && j === 0)) drawAlignmentPattern(alignPatPos[i], alignPatPos[j])
    }
  }

  // draw format bits

  drawFormatBits(0)

  // draw version

  if (version >= 7) {
    let rem = version
    for (let i = 0; i < 12; ++i) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25)
    const bits = (version << 12) | rem
    assert(bits >>> 18 === 0)

    for (let i = 0; i < 18; ++i) {
      const color = getBit(bits, i)
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      setFunctionModule(a, b, color)
      setFunctionModule(b, a, color)
    }
  }

  // draw codewords

  const allCodewords = addEccAndInterleave(dataCodewords)
  drawCodewords(allCodewords)

  // apply mask and choose version with minimal penalty

  let msk = options.mask
  if (msk === -1) {
    let minPenalty = 1000000000
    for (let i = 0; i < 8; ++i) {
      applyMask(i)
      drawFormatBits(i)
      const penalty = getPenaltyScore()
      if (penalty < minPenalty) {
        msk = i
        minPenalty = penalty
      }
      applyMask(i)
    }
  }
  assert(0 <= msk && msk <= 7)
  applyMask(msk)
  drawFormatBits(msk)

  return modules
}

const stringToQrMatrix = (text, options = {}) => {
  const mergedOptions = { ...defaultOptions, ...options }
  if (mergedOptions.mask < -1 || mergedOptions.mask > 7) throw new RangeError('Mask value out of range')
  const segments = makeSegments(text)
  return render(segments, mergedOptions)
}

export { stringToQrMatrix, defaultOptions }