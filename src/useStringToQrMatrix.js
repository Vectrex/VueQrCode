import { computed, unref } from 'vue'
import { stringToQrMatrix, defaultOptions } from './stringToQrMatrix'

export function useStringToQrMatrix (text, options = {}) {
    const matrix = computed(() => {
        const resolvedText = unref(text)
        const resolvedOptions = {
            ...defaultOptions,
            ...unref(options),
        }

        return stringToQrMatrix(resolvedText, resolvedOptions)
    })

    return { matrix }
}