import { effect, release, overrideEffect } from "./reactivity"
import { initTree, isRoot } from "./lifecycle"
import { walk } from "./utils/walk"

let isCloning = false

/**
 * isCloning 为 false 时执行回调
 * 
 * @param {Function} callback
 */
export function skipDuringClone(callback) {
    return (...args) => isCloning || callback(...args)
}

/**
 * isCloning 为 true 时执行回调
 * 
 * @param {Function} callback
 */
export function onlyDuringClone(callback) {
    return (...args) => isCloning && callback(...args)
}

/**
 * isCloning 为 false 时执行回调
 * 
 * @param {Function} callback
 */
export function skipWalkingSubClone(callback) {
    return (...args) => isCloning || callback(...args)
}

/**
 * isCloning 为 false 时执行回调
 * 
 * @param {Function} callback
 */
export function interuptCrawl(callback) {
    return (...args) => isCloning || callback(...args)
}

/**
 * [PUBLIC] 
 * 
 * @param {*} oldEl 
 * @param {*} newEl 
 */
export function clone(oldEl, newEl) {
    newEl._x_dataStack = oldEl._x_dataStack

    isCloning = true

    dontRegisterReactiveSideEffects(() => {
        cloneTree(newEl)
    })

    isCloning = false
}

export function cloneTree(el) {
    let hasRunThroughFirstEl = false

    let shallowWalker = (el, callback) => {
        walk(el, (el, skip) => {
            if (hasRunThroughFirstEl && isRoot(el)) return skip()

            hasRunThroughFirstEl = true

            callback(el, skip)
        })
    }

    initTree(el, shallowWalker)
}

function dontRegisterReactiveSideEffects(callback) {
    let cache = effect

    overrideEffect((callback, el) => {
        let storedEffect = cache(callback)

        release(storedEffect)

        return () => {}
    })

    callback()

    overrideEffect(cache)
}
