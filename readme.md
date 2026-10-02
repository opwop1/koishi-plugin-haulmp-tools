# koishi-plugin-haulmp-tools

[![npm](https://img.shields.io/npm/v/koishi-plugin-haulmp-tools?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-haulmp-tools)

欧卡 HaulMP 联机平台信息查询机器人，基于 [Koishi](https://koishi.chat)。

> **致谢**：感谢 <https://gitee.com/black0056/koishi-plugin-haulmp-bot> 提供的开发思路。

## 功能一览

| 分类 | 指令 | 说明 |
| --- | --- | --- |
| 账号 | `绑定H <ID>` / `我的绑定H` / `解绑H` | 绑定 / 查看 / 解除绑定 HaulMP 论坛账号 |
| 账号 | `注册` | 私聊注册 HaulMP 账号（账号 / 密码 / 邮箱三步向导） |
| 账号 | `找回密码` | 私信用注册时保存的恢复码重置密码 |
| 账号 | `登录` / `退出登录` | 私聊设备码免密登录，有效期 30 天 |
| 账号 | `我的通知` | 私聊查看论坛通知（回复 / @ / 徽章等） |
| 账号 | `我的行驶记录` | 私聊查看总里程 / 时长 / 最近会话 / 录制状态 |
| 查询 | `查询H [ID]` | 个人资料卡：在线状态 / 徽章 / 里程排名 / 车队任职 / 最近货运（支持 `@群友`、游戏 ID、QQ 号） |
| 查询 | `定位H [名字或ID]` | 实时定位：地图 + 位置 / 速度 / 朝向 / 车型 + 附近玩家（支持 `@群友`） |
| 排行 | `里程排行榜H` | 全站里程前十 + 我的名次（前 100 显名次，否则显示百分比） |
| 服务器 | `服务器H` | 服务器状态：在线人数 / 协议版本 / 客户端版本 |
| 服务器 | `路况H` | 全平台实时路况：事故 / 施工 / 交警 / 障碍物 / 检查站 |
| 服务器 | `版本H` | HaulMP 客户端版本 + 欧卡 / 美卡游戏版本 |
| 车队 | `绑定车队H <车队ID或链接>` | 绑定本群车队（仅队长可绑定） |
| 车队 | `解绑车队H` | 解除本群车队绑定（绑定人或队长） |
| 车队 | `今日里程H` | 本群车队当天里程排行（每日自动建立基准） |
| 其他 | `菜单` | 功能菜单 |

自动推送（无需指令）：

- **客户端更新推送** —— HaulMP 客户端发新版时自动推送（附机器翻译的更新说明）
- **车队公告推送** —— 已绑定车队的群，公告更新时自动推送
- **游戏版本更新推送** —— 欧卡 / 美卡游戏版本变化时提醒同步升级客户端

所有指令末尾的 `H` / `h` 通用（如 `查询h`）；各功能均可在配置中切换 图片 / 文字 输出。

## 配置项

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `apiBase` | `https://forum.haulmp.com/api/forum` | HaulMP 论坛 API 根地址 |
| `vtcBase` | `https://vtc.haulmp.com/api` | HaulMP VTC API 根地址 |
| `statusUrl` | `https://haulmp.com/api/status` | 服务器在线状态接口 |
| `mapLiveUrl` | `https://map.haulmp.com/api/live` | 实时地图数据接口 |
| `pushChannels` | （空） | 自动推送限定群，逗号分隔（如 `onebot:123456`），留空推送到全部群 |
| `output.*` | `image` | 各功能的输出方式（图片 / 文字） |

## 目录结构

```
src/
  index.js            入口：配置 / 指令注册 / 中间件
  api/                平台接口层（accountsApi / forumApi / vtcApi）
  command/            功能模块（13 个）
  database/           数据模型与缓存（model / rankCache / cityCache / companySnap）
  util/               共享工具（common / constant / translate / geo）
  resource/map/       定位用 maplibre 地图资源
```

## 本地数据

运行后会在 Koishi 数据目录 `data/` 下生成以下缓存文件，删除后均可自动重建：

| 文件 | 用途 |
| --- | --- |
| `haulmp_ranks.json` | 全站里程排行缓存（12 小时重建） |
| `haulmp_ranks_partial.json` | 排行构建断点续传进度 |
| `haulmp_company_snap.json` | 车队每日里程基准快照 |
| `haulmp_company_ann.json` | 车队公告推送记录 |
| `haulmp_client.json` | 客户端版本推送记录 |
| `haulmp_game_ver.json` | 游戏版本推送记录 |
| `haulmp_player_ids.json` | 游戏 ID ↔ 玩家名映射 |

## 依赖

- Koishi `4.18.x`（peer）
- 数据库服务（`database`）
- `puppeteer` 服务（卡片图片渲染；未启用时自动退回文字输出）

## License

[MIT](./LICENSE)
