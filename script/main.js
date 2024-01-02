const fs = require("fs")
const https = require("https")
const http = require("http")

const isDebug = false
let check_time = 0
let lunch_time = 0
let config = {}
let watch_list = {}
let command_list = {
    "列表": commandList,
    "添加": commandAdd,
    "删除": commandDelete,
    "暂停": commandPause,
    "启动": commandLunch,
    "重载": commandReload,
    "检测": commandCheck,
    "捕获开启": enableCatch,
    "捕获关闭": disableCatch,
}
process.on('uncaughtException', error => {
    if (config.disable_error_catch) {
        return
    }

    // console.error(error);
    sendMessageDebug(`捕获异常:\n${error.stack}`)
})

process.on('unhandledRejection', error => {
    if (config.disable_error_catch) {
        return
    }

    // console.error(error);
    sendMessageDebug(`捕获异常:\n${error.stack}`)
})

loadRoom()

http.createServer(function (request, response) {
    let message = ""
    request.on('data', function (chunk) {
        message += chunk
    })

    request.on('end', () => {
        parseMessage(message)
        response.writeHead(200)
        response.end()
    })
}).listen(5800)

lunch_time = parseInt(Date.now() / 1000)
sendMessageDebug(`服务启动\n启动时间:{lunch_time}`)

async function loadRoom() {
    initInfo()

    let time_counter = 0
    Object.keys(config.room_list).forEach(uid => {
        time_counter += config.request_interval
        setTimeout(() => {
            addRoomWatch(uid)
        }, time_counter)
    })
}

function initInfo() {
    readConfig()

    for (let uid of Object.keys(config.room_list)) {
        if (!config.room_list[uid].name) {
            setupRoomInfo(uid).then(
                (room_info) => {
                    if (room_info) {
                        writeConfig()
                    }
                }
            )
        }
    }
}

async function setupRoomInfo(uid) {
    const live_info = await getLiveInfo(uid)
    console.log(live_info);
    let room_info = config.room_list[uid]
    if (!live_info) {
        console.log(`UID:[${uid}]所属直播间信息为空`)
        return undefined
    }
    room_info.name = live_info.uname
    room_info.uid = uid
    room_info.room_id = live_info.room_id
    room_info.title = live_info.title
    room_info.cover = live_info.cover_from_user
    room_info.status = live_info.live_status
    room_info.last_start_time = live_info.live_time
    room_info.last_end_time = 0
    room_info.send_to_debug = true
    room_info.qq_group_list = []
    room_info.qq_person_list = []
    return room_info
}

function readConfig() {
    config = JSON.parse(
        fs.readFileSync("./script/config.json", "utf-8"))
}

function writeConfig() {
    fs.writeFileSync("./script/config.json", JSON.stringify(config), "utf-8")
}

function getLiveInfo(uid) {
    return new Promise((resolve, reject) => {
        const url = `https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids?uids[]=${uid}`
        https.get(url, res => {
            let body = ""

            res.on("data", (chunk) => {
                body += chunk
            })

            res.on("end", () => {
                live_info = JSON.parse(body).data[uid]
                resolve(live_info)
            })
        }).on("error", (error) => {
            reject(error)
        })
    })
}

async function updateRoomInfo(uid) {
    let live_info = await getLiveInfo(uid)

    if (!live_info) {
        return
    }

    let room_info = config.room_list[uid]

    room_info.name = live_info.uname
    room_info.room_id = live_info.room_id

    let status = live_info.live_status
    if (room_info.cover !== live_info.cover_from_user || room_info.title !== live_info.title) {
        room_info.title = live_info.title
        room_info.cover = live_info.cover_from_user
        if (status === room_info.status) {
            status = 3
        }
    }

    if (status === room_info.status) {
        return
    }

    room_info.status = status
    switch (room_info.status) {
        case 0:
            room_info.last_end_time = parseInt(Date.now() / 1000)
            break
        case 1:
            room_info.last_start_time = live_info.live_time
            break
    }
    sendTemplateMessage(room_info)
    room_info.status = live_info.live_status
    writeConfig()
}

function sendTemplateMessage(room_info) {
    let message = config.message_template[room_info.status]
    sendMessage(room_info, message)
}

function timestampToDate(time_stamp) {
    if (!time_stamp) {
        return "无数据"
    }
    let date = new Date(time_stamp * 1000)
    return date.toLocaleDateString("zh-cn").replace("/", "年").replace("/", "月") + "日" + date.toTimeString().substring(0, 8)
}

function getTimeDifference(startTimestamp, endTimestamp) {
    if (!startTimestamp || !endTimestamp) {
        return "无数据"
    }
    let timestamp = endTimestamp - startTimestamp
    return parseInt(timestamp / 3600) + "小时" + parseInt(timestamp / 60 % 60) + "分钟" + timestamp % 60 + "秒"
}

function sendMessage(room_info, message) {
    if (!message) {
        console.log(`[ERROR]没有找到提醒消息。\n房间信息:${room_info.name}-${room_info.room_id}-${room_info.status}`)
        return
    }

    message = replaceMessage(message, room_info)

    if (room_info.send_to_debug) {
        sendMessageDebug(message)
    }
    sendMessagePersonAll(room_info.qq_person_list, message)
    sendMessageGroupAll(room_info.qq_group_list, message)
}

function sendMessageDebug(message) {
    if (!message) {
        return
    }

    message = replaceMessage(message)
    sendMessageGroupAll(config.debug_group_list, message)
    sendMessagePersonAll(config.debug_person_list, message)
}

function replaceMessage(message, room_info = null) {
    if (room_info) {
        const imageCode = (config.send_cover && room_info.cover) ? `[CQ:image,file=${room_info.cover}]` : ''
        message = message.replace("{name}", room_info.name)
            .replace("{title}", room_info.title)
            .replace("{room_id}", room_info.room_id)
            .replace("{cover}", imageCode)
            .replace("{last_start_time}", timestampToDate(room_info.last_start_time))
            .replace("{last_end_time}", timestampToDate(room_info.last_end_time))
            .replace("{live_time}", getTimeDifference(room_info.last_start_time, room_info.last_end_time))
    }

    message = message.replace("{lunch_time}", timestampToDate(lunch_time))
        .replace("{check_time}", timestampToDate(check_time))
        .replace("{runtime}", getTimeDifference(lunch_time, check_time))

    return message
}

function sendMessagePersonAll(person_list, message) {
    if (!person_list || person_list.length <= 0) {
        return
    }

    let time = 0
    for (const person of person_list) {
        setTimeout(() => {
            sendMessagePerson(person, message)
        }, time)
        time += config.request_interval
    }
}

function sendMessageGroupAll(group_list, message) {
    if (!group_list || group_list.length <= 0) {
        return
    }

    let time = 0
    for (const group of group_list) {
        setTimeout(() => {
            sendMessageGroup(group, message)
        }, time)
        time += config.request_interval
    }
}

async function sendMessagePerson(person, message) {
    if (!person) {
        return
    }

    console.log(`\n发送消息到:${person},消息内容:\n${message}\n`)
    const url = `http://127.0.0.1:5700/send_private_msg?user_id=${person}&message=${message}&auto_escape=false`
    await httpGetSync(url)
}

async function sendMessageGroup(group, message) {
    if (!group.id) {
        return
    }

    console.log(`\n发送消息到:${group.id},是否@全体:${group.at_all},消息内容:\n${message}\n`)
    const atCode = group.at_all ? "[CQ:at,qq=all,name=不在群的QQ]" : ""
    const url = `http://127.0.0.1:5700/send_group_msg?group_id=${group.id}&message=${atCode}\n${message}&auto_escape=false`
    await httpGetSync(url)
}

function httpGetSync(url) {
    if (isDebug) {
        return null
    }

    return new Promise((resolve, reject) => {
        http.get(encodeURI(url), (res) => {
            res.on("end", () => {
                resolve()
            })
        }).on("error", (error) => {
            console.error(error)
            reject(error)
        })
    })
}

function parseMessage(message) {
    let json = JSON.parse(message)
    if (json.message_type !== "private" || !config.debug_person_list.includes(json.sender.user_id)) {
        return
    }

    sub_command = json.message.split(" ")
    command_action = command_list[sub_command[0]]

    if (!command_action) {
        console.log("无法识别的命令")
        return
    }

    command_action(sub_command)
}

function commandList(arg) {
    let time_counter = 0
    Object.values(config.room_list).forEach(room_info => {
        if (!room_info.name) {
            return
        }

        time_counter += config.request_interval
        setTimeout(() => {
            sendMessageDebug(`主播:${room_info.name}\nUID:${room_info.uid}\n直播链接:https://live.bilibili.com/${room_info.room_id}\n直播间状态:${room_info.status}`)
        }, time_counter)
    })
}

async function addRoom(uid, keep = false) {
    config.room_list[uid] = {}
    const room_info = await setupRoomInfo(uid)
    if (!room_info && !keep) {
        delete config.room_list[uid]
        return undefined
    }
    return room_info
}

function addRoomWatch(uid) {
    watch_list[uid] = setInterval(() => {
        updateRoomInfo(uid)
    }, config.update_interval)
}

function commandAdd(arg) {
    uid = arg[1]
    keep = (/true/i).test(arg[2])

    if (Object.keys(config.room_list).includes(uid)) {
        sendMessageDebug(`UID:[${uid}]已在监控列表中，无需重复添加`)
        return
    }

    addRoom(uid, keep).then(
        (room_info) => {
            if (!room_info) {
                sendMessageDebug(`添加UID:[${uid}]暂无直播间`)
                return
            }
            addRoomWatch(uid)
            writeConfig()
            sendMessageDebug(`添加UID:[${uid}]所属直播间成功\n主播:${room_info.name}\n直播链接:https://live.bilibili.com/${room_info.room_id}\n直播间状态:${room_info.status}`)
        }
    )
}

function deleteRoom(uid) {
    delete config.room_list[uid]
}

function deleteRoomWatch(uid) {
    clearInterval(watch_list[uid])
    delete watch_list[uid]
}

function commandDelete(arg) {
    uid = arg[1]

    if (!Object.keys(config.room_list).includes(uid)) {
        sendMessageDebug(`UID:[${uid}]不在监控列表中，无法删除`)
        return
    }

    deleteRoomWatch(uid)
    sendMessageDebug(`删除UID:[${uid}]所属直播间成功\n主播:${config.room_list[uid].name}\n直播链接:https://live.bilibili.com/${config.room_list[uid].uid}`)
    deleteRoom(uid)
    writeConfig()
}

function commandPause(arg) {
    Object.keys(watch_list).forEach(uid => {
        deleteRoomWatch(uid)
    })
    sendMessageDebug("服务暂停")
}

async function commandLunch(arg) {
    await loadRoom()
    lunch_time = parseInt(Date.now() / 1000)
    sendMessageDebug(`服务启动\n启动时间:{lunch_time}`)
}

async function commandReload(arg) {
    Object.keys(watch_list).forEach(uid => {
        deleteRoomWatch(uid)
    })
    await loadRoom()
    sendMessageDebug("重载配置完成")
}

function commandCheck(arg) {
    check_time = parseInt(Date.now() / 1000)
    sendMessageDebug(`检测运行状态\n检测时间:{check_time}\n累计运行时间:{runtime}`)
}

function enableCatch(arg) {
    config.disable_error_catch = false
    writeConfig()
    sendMessageDebug(`异常捕获开启`)
}

function disableCatch(arg) {
    config.disable_error_catch = true
    writeConfig()
    sendMessageDebug(`异常捕获关闭`)
}