import { startObservingMutations, onAttributesAdded, onElAdded, onElRemoved, cleanupAttributes } from "./mutation"
import { deferHandlingDirectives, directives } from "./directives"
import { dispatch } from './utils/dispatch'
import { nextTick } from "./nextTick"
import { walk } from "./utils/walk"
import { warn } from './utils/warn'

export function start() {
    if (! document.body) warn('Unable to initialize. Trying to load Alpine before `<body>` is available. Did you forget to add `defer` in Alpine\'s `<script>` tag?')

    dispatch(document, 'alpine:init')
    dispatch(document, 'alpine:initializing')

    startObservingMutations()

    onElAdded(el => initTree(el, walk))
    onElRemoved(el => nextTick(() => destroyTree(el)))

    onAttributesAdded((el, attrs) => {
        directives(el, attrs).forEach(handle => handle())
    })

    // 是否为非嵌套在根元素下的元素(即顶层元素)
    let outNestedComponents = el => ! closestRoot(el.parentNode || closestRoot(el))

    Array.from(document.querySelectorAll(allSelectors()))
        .filter(outNestedComponents) // 找出非嵌套元素(即顶层元素)
        .forEach(el => {
            initTree(el)
        })

    dispatch(document, 'alpine:initialized')
}

let rootSelectorCallbacks = []
let initSelectorCallbacks = []

/**
 * 获取根属性选择器.
 * @returns ["[x-data]"]
 */
export function rootSelectors() {
    return rootSelectorCallbacks.map(fn => fn())
}

/**
 * 获取所有属性选择器. 
 * querySelectorAll() 支持多选择器, 这里返回的数组会被隐式转换为逗号分隔的属性选择器.
 * @returns ["[x-data]", "[x-init]"]
 */
export function allSelectors() {
    return rootSelectorCallbacks.concat(initSelectorCallbacks).map(fn => fn())
}

/**
 * 添加根选择器, x-data 中调用.
 * @param {function} selectorCallback 拼装为属性选择器
 */
export function addRootSelector(selectorCallback) { rootSelectorCallbacks.push(selectorCallback) }

/**
 * 添加初始化选择器, x-init 中调用.
 * @param {function} selectorCallback 拼装为属性选择器
 */
export function addInitSelector(selectorCallback) { initSelectorCallbacks.push(selectorCallback) }

/**
 * 找出根元素(拥有x-root属性的元素), 找不到则返回 undefined.
 * @param {Element} el HTML 元素
 * @returns 根元素(拥有x-root属性的元素)或 undefined
 */
export function closestRoot(el) {
    if (rootSelectors().some(selector => el.matches(selector))) return el

    if (! el.parentElement) return

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

export function initTree(el, walker = walk) {
    deferHandlingDirectives(() => {
        walker(el, (el, skip) => {
            directives(el, el.attributes).forEach(handle => handle())

            el._x_ignore && skip()
        })
    })
}

function destroyTree(root) {
    walk(root, el => cleanupAttributes(el))
}
