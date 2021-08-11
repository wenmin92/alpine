
import { scheduler } from './scheduler'

let reactive, effect, release, raw

let shouldSchedule = true

/**
 * [PUBLIC] DOUBT: 意义不明
 */
export function disableEffectScheduling(callback) {
    shouldSchedule = false

    callback()

    shouldSchedule = true
}

/**
 * [PUBLIC] 设置响应式引擎
 * 在 index.js 中调用
 * 
 * @param {*} engine 默认使用 @vue/reactivity, 传入一个对象: {reactive, effect, release, raw}
 */
export function setReactivityEngine(engine) {
    reactive = engine.reactive
    release = engine.release
    effect = (callback) => engine.effect(callback, {
        scheduler: task => {
            if (shouldSchedule) {
                scheduler(task) // 加入调度器的执行队列
            } else {
                task()
            }
        }
    })
    raw = engine.raw
}

export function overrideEffect(override) { effect = override }

/**
 * 生成在元素上绑定副作用函数的函数对(添加, 移除)
 */
export function elementBoundEffect(el) {
    let cleanup = () => { }

    let wrappedEffect = (callback) => {
        let effectReference = effect(callback)

        if (!el._x_effects) {
            el._x_effects = new Set

            // Livewire depends on el._x_runEffects.
            el._x_runEffects = () => { el._x_effects.forEach(i => i()) }
        }

        el._x_effects.add(effectReference) // 将副作用函数放到元素的 _x_effects 属性上

        // DOUBT: 这样写的话, 当多次调用 wrappedEffect 后, 能否清除所有副作用函数?
        cleanup = () => {
            if (effectReference === undefined) return

            el._x_effects.delete(effectReference) // 从元素的 _x_effects 属性上移除对应的副作用函数

            release(effectReference) // 停止这个副作用
        }
    }

    return [wrappedEffect, () => { cleanup() }]
}

/**
 * [PUBLIC] @vue/reactivity API
 */
export {
    release, // 停止一个副作用. 后续对数据的变更不会触发副作用函数的重新执行
    reactive, // 接收一个对象作为参数，并返回该对象的代理对象
    effect, // 定义副作用函数. 副作用函数内的响应式数据会与副作用函数之间建立联系, 即所谓的依赖收集, 当响应式数据变化之后, 会导致副作用函数重新执行
    raw, // 接收代理对象作为参数，并获取原始对象
}
