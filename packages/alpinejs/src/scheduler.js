
let flushPending = false
let flushing = false
let queue = [] // 队列

/**
 * 调度器
 */
export function scheduler(callback) { queueJob(callback) }

/**
 * 队列中加入任务
 */
function queueJob(job) {
    if (!queue.includes(job)) queue.push(job)

    queueFlush()
}

/**
 * flush 队列
 */
function queueFlush() {
    if (!flushing && !flushPending) {
        flushPending = true

        queueMicrotask(flushJobs) // 以微任务的方式执行
    }
}

/**
 * flush 队列的具体执行代码
 */
export function flushJobs() {
    flushPending = false
    flushing = true

    for (let i = 0; i < queue.length; i++) {
        queue[i]() // 执行调度器中的代码
    }

    queue.length = 0

    flushing = false
}
