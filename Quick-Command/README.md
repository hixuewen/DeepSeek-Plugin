# 快捷命令（dsh-quick-commands）

任务执行完成后，在输入框上方浮出一排快捷命令。点一下，按钮上的文字会直接作为消息发送给 Agent——比如点「提交」，等同于你在输入框里敲下「提交」并回车。

## 安装

### 从 GitHub 安装（推荐）

本插件位于 [`hixuewen/DeepSeek-Plugin`](https://github.com/hixuewen/DeepSeek-Plugin) 仓库的 `Quick-Command` 子目录。在 DSH 侧边栏的 **Plugins** 页选择安装，填入：

```
github:hixuewen/DeepSeek-Plugin#path:Quick-Command
```

或让 Agent 调用：

```text
plugin_manager install_bundle target: "github:hixuewen/DeepSeek-Plugin#path:Quick-Command"
```

`#path:Quick-Command` 不能省略：插件包位于仓库子目录，仓库根没有 `package.json`。

安装后 bundle 默认启用。替换运行中的插件后通常需要重启 DSH 进程。想锁定版本时按仓库标签安装，例如 `github:hixuewen/DeepSeek-Plugin#vX.Y.Z&path:Quick-Command`（把 `vX.Y.Z` 换成已发布的标签）。

> 如果你之前用 `link:` 方式装过本地目录版本（旧包名 `@local/dsh-quick-commands`），请先在 Plugins 页移除它，再安装 GitHub 版本，避免两个同名 bundle 冲突。

### 从本地目录安装（开发用）

```text
plugin_manager install_bundle target: "/absolute/path/to/DeepSeek-Plugin/Quick-Command"
```

本地目录以 `link:` 方式接入，修改 `client.js` 后由 HMR 重新加载；源目录不能移动或删除。

## 行为

- **任务完成后出现**：当前会话处于空闲（Agent 不在运行、会话已有内容）时显示；运行中自动收起。
- **点一下即发送**：通过公开的 `InputActions.setDraft()` 写入按钮文字，再调用 `InputActions.submit()` 提交，与手动输入后回车走同一条提交链路。
- **输入文字即收起**：输入框里一旦有草稿（包括手动输入、粘贴、`@` 引用等），快捷行立即隐藏；这次输入期间不再出现，直到下一轮任务完成后重新可用。
- **无会话 / 空白会话不出现**：新建但还没发过消息的会话不会显示。
- **与输入框对齐**：快捷行使用宿主输入框卡片的宽度变量，同宽居中显示在其正上方。

## 预制命令

| 按钮 | 发送给 Agent 的内容 |
| --- | --- |
| 提交 | `提交` |
| 继续 | `继续` |
| 确认 | `确认` |

预制命令的文字固定，但可以在「管理」面板里删除；删除后永久消失，没有恢复入口（需要时清除站点数据，或编辑 `client.js` 顶部的 `BUILTIN` 后重新加载）。

## 管理命令

点「管理」后，面板按「预制命令 → 自定义命令」的顺序列出当前所有命令：

- **添加**：点「+ 添加」，输入文字后按 `Enter` 或「确定」；`Esc` 或「取消」放弃。空内容和与已有命令重复的文字会被拒绝，最长 40 字。
- **编辑**：自定义命令上点 `✎` 修改文字，`Enter` 保存、`Esc` 取消；预制命令不可编辑。
- **排序**：自定义命令上点 `↑` / `↓` 调整顺序；预制命令顺序固定。
- **删除**：任意命令上点 `×` 移除；预制命令删除后不会再出现。

预制命令的删除记录保存在 `localStorage` 的 `dsh-quick-commands.hidden`，自定义命令保存在 `dsh-quick-commands.custom`。两者都只属于当前浏览器配置，刷新或重启 DSH 后仍在；换浏览器、换设备或清除站点数据后不会保留。

## 分发与发版

本包是标准 DSH bundle，跟随 [`hixuewen/DeepSeek-Plugin`](https://github.com/hixuewen/DeepSeek-Plugin) 主仓库发版，无构建步骤：

1. 修改 `Quick-Command/package.json` 的 `version`。
2. （可选）在 `Quick-Command/` 下运行 `npm pack --dry-run` 确认打包文件列表。
3. 在仓库根目录提交并打标签：

   ```bash
   git add -A
   git commit -m "发布 Quick Command vX.Y.Z"
   git tag vX.Y.Z
   git push origin main --tags
   ```

4. 使用者按新标签安装（标签作用于整个仓库，`#path:` 仍须保留）：

   ```
   github:hixuewen/DeepSeek-Plugin#vX.Y.Z&path:Quick-Command
   ```

不写标签则跟随默认分支：`github:hixuewen/DeepSeek-Plugin#path:Quick-Command`。

包名和 `cordis.patch.yml`、`client.js` 中的模块 id 必须保持一致（当前均为 `dsh-quick-commands`）；改包名时三处要同步修改。

## 兼容性

- 已在 DeepSeek Harness `0.2.1-rc.2` 上验证。
- `package.json` 通过 `engines.dsh` 声明 `>=0.2.1-rc.2 <0.3.0`；不满足时安装会被拒绝。
- 依赖宿主提供的 `conversation.input.dock` 插槽与 `InputActions.setDraft/submit()`，不引入任何运行时依赖。

## 实现结构

| 插槽 | 作用域 | 内容 |
| --- | --- | --- |
| `conversation.input.dock` | session | 输入框卡片上方、与卡片同宽居中的条目，渲染快捷命令行 |

- 可见性来自 `useSession()`（`running` / `blank` / `openState`）和 `useInput()`（`phase` / `draft`），只订阅需要的切片。
- 预制命令的删除记录与自定义命令各由一个模块级 store + `useSyncExternalStore` 在各会话实例间共享，写入 `localStorage`；监听 `storage` 事件做跨标签页同步。
- 样式只使用宿主主题 token（`--dsw-alias-*`）与输入框宽度变量，明暗主题自动适配。
- 不使用定时轮询，也不写宿主 DOM。

## 许可证

[MIT](LICENSE) © 2026 lanxuewen

## 文件

```
package.json          包清单 + dsh.bundle / dsh.client / engines 声明
cordis.patch.yml      插入插件行（id: quick-commands）
index.js              Host 半边：不注册任何东西（纯浏览器行为）
client.js             浏览器半边：快捷命令行、自定义命令管理与发送逻辑
locale/zh.json        插件展示元数据（中文）
locale/en.json        插件展示元数据（英文）
icon.svg              图标
LICENSE               MIT 许可证
```
