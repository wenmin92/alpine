import { onAttributeRemoved, onElRemoved } from './mutation'
import { evaluate, evaluateLater } from './evaluator'
import { elementBoundEffect } from './reactivity'
import Alpine from './alpine'

let prefixAsString = 'x-'

/**
 * 获取指令的完整指令名, 如, 传入 "text", 返回 "x-text"
 * 
 * @param {String} subject 主题(指令), 如 "text"
 * @returns 完整指令名, 如 "x-text"
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
 * 保存所有注册的指令与其处理器, key-value 对
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
 * @param {[{name:String, value:String}] | NamedNodeMap}} attributes HTML 元素的属性, 数组或 NamedNodeMap (用于表示 Attr 对象的集合), 可通过 Array.from() 转换为 {name, Attr|value} 数组. 参考: https://developer.mozilla.org/en-US/docs/Web/API/Element/attributes
 * @param {*} originalAttributeOverride 未知
 * @returns 指令处理器数组
 */
export function directives(el, attributes, originalAttributeOverride) {
    let transformedAttributeMap = {}

    let directives = Array.from(attributes) // 转换为 {name, Attr|value} 数组
        .map(toTransformedAttributes((newName, oldName) => transformedAttributeMap[newName] = oldName)) // 将 {name, Attr|value} 对象中的 name 转换为标准形式, 如, : 和 @ 分别转换为 bind: 和 on:
        .filter(outNonAlpineAttributes) // 过滤掉非 Alpine 指令的属性
        .map(toParsedDirectives(transformedAttributeMap, originalAttributeOverride)) // 解析属性(指令)为指令对象
        .sort(byPriority) // 按优先级排序

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
 * 获取指令对应的处理器(即, 指令注册时的回调参数), 并扩展处理器
 * 
 * @param {Element} el HTML 元素
 * @param {Directive} directive 指令对象 {type, original, expression, modifier, value}
 * @returns 经过扩展的处理器
 */
export function getDirectiveHandler(el, directive) {
    let noop = () => { }

    let handler = directiveHandlers[directive.type] || noop // 指令所对应的处理器

    let cleanups = [] // "清理器"数组

    let cleanup = callback => cleanups.push(callback) // "清理器"的注册器

    let [effect, cleanupEffect] = elementBoundEffect(el) // 添加, 移除绑定到元素上的副作用函数

    cleanups.push(cleanupEffect)

    let utilities = {
        Alpine,
        effect, // 添加"绑定到元素上的副作用函数"
        cleanup, // "清理器"的注册器
        evaluateLater: evaluateLater.bind(evaluateLater, el), // eval 器, 绑定 el
        evaluate: evaluate.bind(evaluate, el), // eval 器, 绑定 el
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

/**
 * [高阶函数] 设置指令的属性转换器(简写, 别名)时, 返回传给 mapAttributes 函数的回调
 * 因为属性名后面还可以带修饰, 所以使用 startsWith
 * 
 * @param {String} subject 要转换的属性名称
 * @param {String} replacement 转换后的名称
 */
export let startingWith = (subject, replacement) => ({ name, value }) => {
    if (name.startsWith(subject)) name = name.replace(subject, replacement)

    return { name, value }
}

export let into = i => i

/**
 * [高阶函数] 转换属性名, 用于设置指令别名, 如, : 和 @ 分别表示 bind: 和 on:
 */
function toTransformedAttributes(callback) {
    return ({ name, value }) => {
        let { name: newName, value: newValue } = attributeTransformers.reduce((carry, transform) => transform(carry), { name, value }) // 依次调用属性转换器, 对名字进行转换

        if (newName !== name) callback(newName, name) // 如果属性名是需要转换的, 用新旧属性名作为参数调用回调函数

        return { name: newName, value: newValue }
    }
}

/**
 * 存储所有属性转换器, 用于设置指令别名, 如, : 和 @ 分别表示 bind: 和 on:
 * 转换器在 toTransformedAttributes 中被调用
 */
let attributeTransformers = []

/**
 * [PUBLIC] 添加属性转换器, 用于设置指令别名, 如, : 和 @ 分别表示 bind: 和 on:
 * 转换器在 toTransformedAttributes 中被调用
 */
export function mapAttributes(callback) {
    attributeTransformers.push(callback)
}

/**
 * 判断是否为 Alpine 属性(指令)
 * 
 * @param {{name, Attr|value}} param 属性
 */
function outNonAlpineAttributes({ name }) {
    return alpineAttributeRegex().test(name)
}

/**
 * Apline 属性(指令) 正则, 由于可以自定义前缀, 所以导出的是方法, 动态获取
 */
let alpineAttributeRegex = () => (new RegExp(`^${prefixAsString}([^:^.]+)\\b`))

/**
 * [高阶函数] 解析属性(指令)为指令对象
 * 
 * @param {Map} transformedAttributeMap 属性(指令)别名对照表
 * @param {String} originalAttributeOverride 原属性(指令)名
 */
function toParsedDirectives(transformedAttributeMap, originalAttributeOverride) {
    return ({ name, value }) => {
        let typeMatch = name.match(alpineAttributeRegex())
        let valueMatch = name.match(/:([a-zA-Z0-9\-:]+)/)
        let modifiers = name.match(/\.[^.\]]+(?=[^\]]*$)/g) || []
        let original = originalAttributeOverride || transformedAttributeMap[name] || name

        return {
            type: typeMatch ? typeMatch[1] : null, // 指令类型, 即去除前缀和修饰的部分, 如, text
            value: valueMatch ? valueMatch[1] : null, // 指令值, 指令作用的对象, 如 x-bind:class, x-on:click
            modifiers: modifiers.map(i => i.replace('.', '')), // 修饰词, 用于改变指令的行为
            expression: value, // 指令表达式
            original, // 原始指令名
        }
    }
}

const DEFAULT = 'DEFAULT'

/**
 * 指令优先级
 */
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
    DEFAULT, // 自定义指令
    'element',
]

/**
 * 按优先级排序
 */
function byPriority(a, b) {
    let typeA = directiveOrder.indexOf(a.type) === -1 ? DEFAULT : a.type
    let typeB = directiveOrder.indexOf(b.type) === -1 ? DEFAULT : b.type

    return directiveOrder.indexOf(typeA) - directiveOrder.indexOf(typeB)
}
