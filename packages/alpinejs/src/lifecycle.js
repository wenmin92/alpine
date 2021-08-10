import { startObservingMutations, onAttributesAdded, onElAdded, onElRemoved, cleanupAttributes } from "./mutation"
import { deferHandlingDirectives, directives } from "./directives"
import { dispatch } from './utils/dispatch'
import { nextTick } from "./nextTick"
import { walk } from "./utils/walk"
import { warn } from './utils/warn'

/**
 * [PUBLIC] Alpine 代码加载后, 启动 Alpine
 */
export function start() {
    if (!document.body) warn('Unable to initialize. Trying to load Alpine before `<body>` is available. Did you forget to add `defer` in Alpine\'s `<script>` tag?')

    dispatch(document, 'alpine:init')
    dispatch(document, 'alpine:initializing')

    // 启动 DOM 变动监听
    startObservingMutations()

    onElAdded(el => initTree(el, walk))
    onElRemoved(el => nextTick(() => destroyTree(el)))

    onAttributesAdded((el, attrs) => {
        // 获取并解析某个元素中所有指令, 返回相应的指令处理器数组
        directives(el, attrs).forEach(handle => handle())
    })

    // 是否为非嵌套在根元素下的元素(即顶层元素)
    let outNestedComponents = el => !closestRoot(el.parentElement)

    Array.from(document.querySelectorAll(allSelectors())) // 所有根元素和初始化元素(x-data, x-init)
        .filter(outNestedComponents) // 处于顶层的根元素和初始化元素
        .forEach(el => {
            initTree(el)
        })

    dispatch(document, 'alpine:initialized')
}

let rootSelectorCallbacks = []
let initSelectorCallbacks = []

/**
 * 获取根选择器.
 * @returns ["[x-data]"]
 */
export function rootSelectors() {
    return rootSelectorCallbacks.map(fn => fn())
}

/**
 * 获取所有根选择器和初始化选择器, 即 x-data 和 x-init. 
 * querySelectorAll() 支持多选择器, 这里返回的数组会被隐式转换为逗号分隔的属性选择器 ("[x-data],[x-init]").
 * @returns ["[x-data]", "[x-init]"]
 */
export function allSelectors() {
    return rootSelectorCallbacks.concat(initSelectorCallbacks).map(fn => fn())
}

/**
 * [PUBLIC] 添加根选择器, x-data 中调用.
 * @param {function} selectorCallback 执行该回调可以得到属性选择器(String)
 */
export function addRootSelector(selectorCallback) { rootSelectorCallbacks.push(selectorCallback) }

/**
 * 添加初始化选择器, x-init 中调用.
 * @param {function} selectorCallback 执行该回调可以得到属性选择器(String)
 */
export function addInitSelector(selectorCallback) { initSelectorCallbacks.push(selectorCallback) }

/**
 * [PUBLIC] 以给定元素为基, 向上递归, 找出根元素(拥有 x-root 属性的元素), 找不到则返回 undefined.
 * @param {Element} el HTML 元素
 * @returns 根元素(拥有x-root属性的元素)或 undefined
 */
export function closestRoot(el) {
    if (!el) return

    if (rootSelectors().some(selector => el.matches(selector))) return el // Element.matches(), 检查元素是否匹配给定选择器, 参考: https://developer.mozilla.org/en-US/docs/Web/API/Element/matches

    if (!el.parentElement) return

    return closestRoot(el.parentElement)
}

/**
 * 判断是否为根元素(拥有x-root属性的元素)
 * @param {Element} el HTML 元素
 * @returns 是否为根元素
 */
export function isRoot(el) {
    return rootSelectors().some(selector => el.matches(selector))
}

/**
 * [PUBLIC] 
 * 
 * @param {*} el 
 * @param {*} walker 
 */
export function initTree(el, walker = walk) {
    deferHandlingDirectives(() => {
        walker(el, (el, skip) => {
            directives(el, el.attributes).forEach(handle => handle()) // Element.attributes 是一个 NamedNodeMap, 用于表示 Attr 对象的集合. 参考: https://developer.mozilla.org/en-US/docs/Web/API/Element/attributes

            el._x_ignore && skip() // 跳过 x-ignore 元素的子元素
        })
    })
}

function destroyTree(root) {
    walk(root, el => cleanupAttributes(el))
}
