import { onAccountChange, accountUsers } from "../../../mhy-plugin/api.js"
import { MysUserDB, UserDB } from "../db/index.js"
/**
 * 基础类，提供实例缓存等一些基础方法
 */
import MysUtil from "./MysUtil.js"

let cacheMap = {}
let reFn = {}

/**
 * 同步数据库提交后的活动对象和账号查询索引。
 * @param {object} change 账号及用户变化
 * @returns {Promise<void>} 刷新完成
 */
async function refreshMhyAccounts(change) {
  const { default: MysUser } = await import("./MysUser.js")
  const { default: NoteUser } = await import("./NoteUser.js")
  const db = await MysUserDB.findByPk(change.accountId)
  const mys = db ? await MysUser.create(change.accountId, db) : cacheMap[`mys:${change.accountId}`]
  if (change.deleted) {
    if (mys) {
      for (const game of ["gs", "sr", "zzz"]) {
        const cache = mys.getCache(game)
        await cache.zDel("query-detail", change.accountId, true)
        await cache.kDel("ltuid-ck", change.accountId)
        await cache.kDel("ltuid-qq", change.accountId)
      }
      mys.ck = ""
      mys._delCache()
    }
  } else if (mys && db) {
    await mys.initCache()
    for (const game of ["gs", "sr", "zzz"]) {
      const cache = mys.getCache(game)
      await cache.kSet("ltuid-ck", change.accountId, db.ck)
      await cache.kSet("ltuid-qq", change.accountId, await accountUsers(change.accountId))
    }
  }
  for (const id of change.userIds) {
    const userDb = await UserDB.findByPk(id)
    if (userDb) {
      const user = cacheMap[`user:${id}`] || new NoteUser(id)
      user._map = false
      await user.initDB(userDb)
    }
  }
}
onAccountChange(refreshMhyAccounts)


export default class BaseModel {
  constructor() {
    return this
  }

  // 获取缓存
  _getThis(model, id = "", time = 10 * 60) {
    const uuid = `${model}:${id}`
    this._uuid = uuid
    if (uuid && cacheMap[uuid]) {
      return cacheMap[uuid]._expire(time)
    }
  }

  // 设置缓存
  _cacheThis(model, id, time = 10 * 60) {
    const uuid = this._uuid || `${model}:${id}`
    this._uuid = uuid
    if (uuid) {
      this._expire(time)
      cacheMap[uuid] = this
      return cacheMap[uuid]
    }
    return this
  }

  // 设置超时时间
  _expire(time = 10 * 60) {
    let id = this._uuid
    reFn[id] && clearTimeout(reFn[id])
    if (time > 0) {
      if (id) {
        reFn[id] = setTimeout(() => {
          reFn[id] && clearTimeout(reFn[id])
          delete reFn[id]
          delete cacheMap[id]
        }, time * 1000)
      }
      return cacheMap[id]
    }
  }

  _delCache() {
    let id = this._uuid
    reFn[id] && clearTimeout(reFn[id])
    delete reFn[id]
    delete cacheMap[id]
  }

  gameKey(game = "gs") {
    return MysUtil.getGameKey(game)
  }

  isGs(game = "gs") {
    return this.gameKey(game) === "gs"
  }

  isSr(game = "gs") {
    return this.gameKey(game) === "sr"
  }
}
