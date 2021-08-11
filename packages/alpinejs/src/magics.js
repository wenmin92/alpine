import Alpine from './alpine'
import { interceptor } from './interceptor'

let magics = {}

/**
 * 注册 magic
 */
export function magic(name, callback) {
    magics[name] = callback
}

/**
 * 将 magics 注入到目标对象中
 */
export function injectMagics(obj, el) {
    Object.entries(magics).forEach(([name, callback]) => {
        Object.defineProperty(obj, `$${name}`, {
            get() { return callback(el, { Alpine, interceptor }) },

            enumerable: false,
        })
    })

    return obj
}
