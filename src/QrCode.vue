<script setup>
  import { useStringToQrMatrix } from './useStringToQrMatrix'
  import { computed } from 'vue'

  const props = defineProps({ text: { type: String, required: true }, options: { type: Object, default: () => ({}) }})
  const { matrix } = useStringToQrMatrix(props.text)
  const defaultOptions = {
    gutter: 4,
    moduleSize: 10,
    svgAsPath: true
  }
  const mergedOptions = computed(() => ({...defaultOptions, ...props.options }))
  const totalSize = computed(() => (matrix.value.length + 2 * mergedOptions.value.gutter) * mergedOptions.value.moduleSize)
  const path = computed(() => {

    const { gutter, moduleSize, svgAsPath } = mergedOptions.value
    const size = matrix.value.length
    let path = ''

    for (let r = 0; r < size; ++r) {
      for (let c = 0; c < size; ++c) {
        if (matrix.value[r][c]) {
          let x = (c + gutter) * moduleSize, y = (r + gutter) * moduleSize
          path +=
              svgAsPath ?
                  `M${x},${y}h${moduleSize}v${moduleSize}h-${moduleSize}z` :
                  `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" />`
        }
      }
    }

    return path
  })
</script>
<template>
  <svg
      xmlns="http://www.w3.org/2000/svg"
      :viewBox="'0 0 ' + totalSize + ' ' + totalSize" :width="totalSize" :height="totalSize"
  >
    <rect width="100%" height="100%" fill="white" />
    <path v-if="mergedOptions.svgAsPath" :d="path" fill="black" />
    <g v-else fill="black">{{ path }}</g>
  </svg>`
</template>