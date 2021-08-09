let onAttributeAddeds = []
let onElRemoveds = []
let onElAddeds = []

/**
 * 钩子: 添加元素时; lifecycle.js#start() 中调用
 * @param {function} callback 
 */
export function onElAdded(callback) {
    onElAddeds.push(callback)
}

/**
 * 钩子: 删除元素时; lifecycle.js#start() 中调用
 * @param {function} callback 
 */
export function onElRemoved(callback) {
    onElRemoveds.push(callback)
}

/**
 * 钩子: 添加属性时; lifecycle.js#start() 中调用
 * @param {function} callback 
 */
export function onAttributesAdded(callback) {
    onAttributeAddeds.push(callback)
}

/**
 * 钩子: 注册元素属性删除时的清理回调; directives.js#getDirectiveHandler() 中调用
 * 
 * @param {Element} el 发生属性移除的元素
 * @param {String} name 移除的属性
 * @param {Function} callback 属性删除时, 执行的清理回调
 */
export function onAttributeRemoved(el, name, callback) {
    if (!el._x_attributeCleanups) el._x_attributeCleanups = {}
    if (!el._x_attributeCleanups[name]) el._x_attributeCleanups[name] = []

    el._x_attributeCleanups[name].push(callback)
}

/**
 * 属性删除后, 执行注册的清理回调, 执行完成后, 删除注册信息
 * 
 * @param {Element} el 所在元素
 * @param {String[]} names 属性名数组
 */
export function cleanupAttributes(el, names) {
    if (!el._x_attributeCleanups) return // 没有注册清理回调, 跳过

    Object.entries(el._x_attributeCleanups).forEach(([name, value]) => {
        (names === undefined || names.includes(name)) && value.forEach(i => i())

        delete el._x_attributeCleanups[name]
    })
}

/**
 * MutationObserver: DOM 变动观察器 (Web API)
 * 文档:
 *   - MDN: https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
 *   - 阮一峰 JS 标准参考教程: https://javascript.ruanyifeng.com/dom/mutationobserver.html
 *   - https://zh.javascript.info/mutation-observer
 *   - https://blog.fundebug.com/2019/01/10/understand-mutationobserver/
 *   - https://segmentfault.com/a/1190000021404402
 * 异步
 * 
 * MutationObserver(callback) 构造函数
 *   接收一个回调参数, 该回调在符合给定的节点和配置的 DOM 变动时调用.
 * 
 * observe(target, options) 实例方法
 *   配置并启动监听
 * 
 * disconnect() 实例方法
 *   停止监听, 之后还可以再次启动
 * 
 * takeRecords() 实例方法
 *   获取尚未处理的变动记录列表, 用于在停止监听前收集未处理的变动, 之后可手动调用 callback 处理这些变动
 */
let observer = new MutationObserver(onMutate)

let currentlyObserving = false

/**
 * MutationObserver 对象创建后需要调用 observe() 方法配置并启动监听
 * observe() 方法接受2个参数:
 *   - target, 所要观察的 DOM 节点
 *   - options, 配置对象, 指定所要观察的特定变动
 *     - subtree, 是否将该观察器应用于该节点的所有后代节点
 *     - childList, 是否观察子节点的新增或删除
 *     - attributes, 是否观察属性值的变动
 *     - attributeFilter, 表示需要观察的特定属性名称的数组
 *     - attributeOldValue, 观察属性变动时, 是否记录变动前的值
 *     - characterData, 是否观察节点内容或节点文本的变动. (关于 characterData, 查看 https://developer.mozilla.org/en-US/docs/Web/API/CharacterData)
 *     - characterDataOldValue 观察点内容变动时, 是否记录变动前的值
 */
export function startObservingMutations() {
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeOldValue: true })

    currentlyObserving = true
}

/**
 * 停止监听 DOM 变动
 */
export function stopObservingMutations() {
    observer.disconnect()

    currentlyObserving = false
}

let recordQueue = []
let willProcessRecordQueue = false

/**
 * 处理尚未处理的变动记录
 */
export function flushObserver() {
    recordQueue = recordQueue.concat(observer.takeRecords())

    if (recordQueue.length && !willProcessRecordQueue) {
        willProcessRecordQueue = true

        queueMicrotask(() => {
            processRecordQueue()

            willProcessRecordQueue = false
        })
    }
}

/**
 * 处理 recordQueue 中保存的变动记录
 */
function processRecordQueue() {
    onMutate(recordQueue)

    recordQueue.length = 0
}

/**
 * 立即处理尚未处理的变动记录
 * 
 * @param {Function} callback 
 * @returns 回调执行的结果
 */
export function mutateDom(callback) {
    if (!currentlyObserving) return callback() // 如果当前不处于监听状态, 则直接回调 callback 并返回

    flushObserver() // 立即处理尚未处理的变动记录

    stopObservingMutations() // 停止监听 DOM 变动

    let result = callback() // 执行 callback

    startObservingMutations() // 重新监听 DOM 变动

    return result
}

/**
 * 创建 MutationObserver 对象时, 注册的回调, 在 DOM 变动时调用
 * 
 * MutationRecord 对象
 *   一个 MutationRecord 表示一个 DOM 变动
 *   属性:
 *     - type: String, 表示变动类型 (childList, attributes, characterData)
 *     - target: Node, 发生变动的节点
 *     - addedNodes: NodeList, 添加的节点
 *     - removedNodes: NodeList, 删除的节点
 *     - attributeName: String, 发生改动的属性
 *     - oldValue: String, 改动前的值
 *     - 其他: previousSibling, nextSibling, attributeNamespace
 * 
 * @param { MutationRecord[] } mutations MutationRecord 数组
 */
function onMutate(mutations) {
    let addedNodes = []
    let removedNodes = []
    let addedAttributes = new Map
    let removedAttributes = new Map

    for (let i = 0; i < mutations.length; i++) {
        if (mutations[i].target._x_ignoreMutationObserver) continue // DOUBT: _x_ignoreMutationObserver 未找到这个

        if (mutations[i].type === 'childList') {
            mutations[i].addedNodes.forEach(node => node.nodeType === 1 && addedNodes.push(node)) // ELEMENT_NODE, 参考: https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
            mutations[i].removedNodes.forEach(node => node.nodeType === 1 && removedNodes.push(node))
        }

        if (mutations[i].type === 'attributes') {
            let el = mutations[i].target
            let name = mutations[i].attributeName
            let oldValue = mutations[i].oldValue

            let add = () => {
                if (!addedAttributes.has(el)) addedAttributes.set(el, [])

                addedAttributes.get(el).push({ name, value: el.getAttribute(name) })
            }

            let remove = () => {
                if (!removedAttributes.has(el)) removedAttributes.set(el, [])

                removedAttributes.get(el).push(name)
            }

            // New attribute.
            if (el.hasAttribute(name) && oldValue === null) {
                add()
                // Changed atttribute.
            } else if (el.hasAttribute(name)) {
                remove()
                add()
                // Removed atttribute.
            } else {
                remove()
            }
        }
    }

    // 删除属性时, 执行属性注册的清理回调
    removedAttributes.forEach((attrs, el) => {
        cleanupAttributes(el, attrs)
    })

    // 添加属性时, 解析属性, 如果是指令, 则执行这些指令
    addedAttributes.forEach((attrs, el) => {
        onAttributeAddeds.forEach(i => i(el, attrs))
    })

    // 添加元素时, initTree(el, walk)
    for (let node of addedNodes) {
        // If an element gets moved on a page, it's registered
        // as both an "add" and "remove", so we wan't to skip those.
        if (removedNodes.includes(node)) continue

        onElAddeds.forEach(i => i(node))
    }

    // 删除元素时, destroyTree(el)
    for (let node of removedNodes) {
        // If an element gets moved on a page, it's registered
        // as both an "add" and "remove", so we want to skip those.
        if (addedNodes.includes(node)) continue

        onElRemoveds.forEach(i => i(node))
    }

    addedNodes = null
    removedNodes = null
    addedAttributes = null
    removedAttributes = null
}
