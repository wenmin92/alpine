/**
 * 遍历节点树, 并对每个节点执行指定回调
 * 
 * @param {Element} el HTML 元素, 要遍历的节点
 * @param {function} callback 要对节点执行的回调
 */
export function walk(el, callback) {
    // DOUBT: 对于 Shadow 节点, 跳过 Shadow 节点本身, 遍历其子节点
    if (el instanceof ShadowRoot) {
        Array.from(el.children).forEach(el => walk(el, callback))
        return
    }

    let skip = false // 用于跳过 x-ignore

    callback(el, () => skip = true) // 用当前元素和 skip 回调(用于跳过 x-ignore) 调用 callback

    if (skip) return // 用于跳过 x-ignore

    let node = el.firstElementChild // 第一个子元素

    // 递归遍历
    while (node) {
        walk(node, callback, false) // 沿着一个分支递归

        node = node.nextElementSibling // 递归完一个分支, 再递归相邻分支, 直至遍历完整棵树
    }
}
// export function walk(el, callback) {
//     if (el instanceof ShadowRoot || el instanceof DocumentFragment) {
//         Array.from(el.children).forEach(el => walk(el, callback))

//         return
//     }

//     callback(el, () => {
//         let node = el.firstElementChild

//         while (node) {
//             walk(node, callback)

//             node = node.nextElementSibling
//         }
//     })
// }
