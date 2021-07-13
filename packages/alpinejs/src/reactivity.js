
import { scheduler } from './scheduler'

let reactive, effect, release, raw

let shouldSchedule = true
export function disableEffectScheduling(callback) {
    shouldSchedule = false

    callback()

    shouldSchedule = true
}

/**
 * 设置响应引擎
 * @param {Object} engine 默认使用 @vue/reactivity, 传入一个对象, {reactive, effect, release, raw}
 */
export function setReactivityEngine(engine) {
    reactive = engine.reactive
    release = engine.release
    effect = (callback) => engine.effect(callback, { scheduler: task => {
        if (shouldSchedule) {
            scheduler(task)
        } else {
            task()
        }
    } })
    raw = engine.raw
}

export function overrideEffect(override) { effect = override }

/**
 * 元素绑定的效果
 * @param {Element} el HTML 元素
 * @returns 
 */
export function elementBoundEffect(el) {
    let cleanup = () => {}

    let wrappedEffect = (callback) => {
        let effectReference = effect(callback)

        if (! el._x_effects) {
            el._x_effects = new Set

            // Livewire depends on el._x_runEffects.
            el._x_runEffects = () => { el._x_effects.forEach(i => i()) }
        }

        el._x_effects.add(effectReference)

        cleanup = () => {
            if (effectReference === undefined) return

            el._x_effects.delete(effectReference)

            release(effectReference)
        }
    }

    return [wrappedEffect, () => { cleanup() }]
}

export {
    release,
    reactive,
    effect,
    raw,
}
