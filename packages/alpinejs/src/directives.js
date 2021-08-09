import { onAttributeRemoved, onElRemoved } from './mutation'
import { evaluate, evaluateLater } from './evaluator'
import { elementBoundEffect } from './reactivity'
import Alpine from './alpine'

let prefixAsString = 'x-'

/**
 * 获取指令的指令名, 如 "x-text"
 * 
 * @param {String} subject 主题
 * @returns 指令名
 */
export function prefix(subject = '') {
    return prefixAsString + subject
}

/**
 * [PUBLIC] 自定义指令名前缀, 如 "x-"
 */
export function setPrefix(newPrefix) {
    prefixAsString = newPrefix
}

/**
 * 所有注册的指令处理器
 */
let directiveHandlers = {}


/**
 * [PUBLIC] 注册指令类型
 * @param {string} name 指令类型名称
 * @param {function} callback 回调
 */
export function directive(name, callback) {
    directiveHandlers[name] = callback
}

/**
 * 获取并解析某个元素中所有指令, 返回相应的指令处理器数组
 * 调用: lifecycle.js#onAttributesAdded(); lifecycle.js#initTree()
 * 
 * @param {Element}} el HTML 元素
 * @param {{name:String, value:Any}|NamedNodeMap}} attributes HTML 元素的属性, 数组或 NamedNodeMap, 可通过 Array.from() 转换为数组. 参考: https://developer.mozilla.org/en-US/docs/Web/API/Element/attributes
 * @param {*} originalAttributeOverride 未知
 * @returns 指令处理器数组
 */
export function directives(el, attributes, originalAttributeOverride) {
    let transformedAttributeMap = {}

    let directives = Array.from(attributes)
        .map(toTransformedAttributes((newName, oldName) => transformedAttributeMap[newName] = oldName))
        .filter(outNonAlpineAttributes)
        .map(toParsedDirectives(transformedAttributeMap, originalAttributeOverride))
        .sort(byPriority)

    return directives.map(directive => {
        return getDirectiveHandler(el, directive)
    })
}

let isDeferringHandlers = false
let directiveHandlerStacks = new Map
let currentHandlerStackKey = Symbol()

/**
 * DOUBT: 意义不明
 * 
 * @param {*} callback 
 */
export function deferHandlingDirectives(callback) {
    isDeferringHandlers = true

    let key = Symbol()

    currentHandlerStackKey = key

    directiveHandlerStacks.set(key, [])

    let flushHandlers = () => {
        while (directiveHandlerStacks.get(key).length) directiveHandlerStacks.get(key).shift()()

        directiveHandlerStacks.delete(key)
    }

    let stopDeferring = () => { isDeferringHandlers = false; flushHandlers() }

    callback(flushHandlers)

    stopDeferring()
}

/**
 * 获取指令对应的处理器, 并扩展处理器
 * @param {Element} el HTML 元素
 * @param {Directive} directive 指令对象 {type: "data", original: "x-data", expression: "{ open: false}", modifier: [], value: null}
 * @returns 经过扩展的处理器
 */
export function getDirectiveHandler(el, directive) {
    let noop = () => { }

    let handler = directiveHandlers[directive.type] || noop

    let cleanups = [] // 清理回调

    let cleanup = callback => cleanups.push(callback) // 清理回调注册程序

    let [effect, cleanupEffect] = elementBoundEffect(el)

    cleanups.push(cleanupEffect) // 

    let utilities = {
        Alpine,
        effect,
        cleanup,
        evaluateLater: evaluateLater.bind(evaluateLater, el),
        evaluate: evaluate.bind(evaluate, el),
    }

    let doCleanup = () => cleanups.forEach(i => i()) // 清理回调. 遍历并执行所有清理回调

    onAttributeRemoved(el, directive.original, doCleanup) // 注册元素属性删除时的清理回调

    let fullHandler = () => {
        if (el._x_ignore || el._x_ignoreSelf) return

        handler.inline && handler.inline(el, directive, utilities)

        handler = handler.bind(handler, el, directive, utilities)

        isDeferringHandlers ? directiveHandlerStacks.get(currentHandlerStackKey).push(handler) : handler()
    }

    fullHandler.runCleanups = doCleanup

    return fullHandler
}

export let startingWith = (subject, replacement) => ({ name, value }) => {
    if (name.startsWith(subject)) name = name.replace(subject, replacement)

    return { name, value }
}

export let into = i => i

function toTransformedAttributes(callback) {
    return ({ name, value }) => {
        let { name: newName, value: newValue } = attributeTransformers.reduce((carry, transform) => {
            return transform(carry)
        }, { name, value })

        if (newName !== name) callback(newName, name)

        return { name: newName, value: newValue }
    }
}

let attributeTransformers = []

/**
 * [PUBLIC]
 * 
 * @param {Function} callback 
 */
export function mapAttributes(callback) {
    attributeTransformers.push(callback)
}

function outNonAlpineAttributes({ name }) {
    return alpineAttributeRegex().test(name)
}

let alpineAttributeRegex = () => (new RegExp(`^${prefixAsString}([^:^.]+)\\b`))

function toParsedDirectives(transformedAttributeMap, originalAttributeOverride) {
    return ({ name, value }) => {
        let typeMatch = name.match(alpineAttributeRegex())
        let valueMatch = name.match(/:([a-zA-Z0-9\-:]+)/)
        let modifiers = name.match(/\.[^.\]]+(?=[^\]]*$)/g) || []
        let original = originalAttributeOverride || transformedAttributeMap[name] || name

        return {
            type: typeMatch ? typeMatch[1] : null,
            value: valueMatch ? valueMatch[1] : null,
            modifiers: modifiers.map(i => i.replace('.', '')),
            expression: value,
            original,
        }
    }
}

const DEFAULT = 'DEFAULT'

let directiveOrder = [
    'ignore',
    'ref',
    'data',
    'bind',
    'init',
    'for',
    'model',
    'transition',
    'show',
    'if',
    DEFAULT,
    'element',
]

function byPriority(a, b) {
    let typeA = directiveOrder.indexOf(a.type) === -1 ? DEFAULT : a.type
    let typeB = directiveOrder.indexOf(b.type) === -1 ? DEFAULT : b.type

    return directiveOrder.indexOf(typeA) - directiveOrder.indexOf(typeB)
}
