# 快捷命令（dsh-quick-commands）

任务执行完成后，在输入框上方浮出一排快捷命令。点一下，按钮上的文字会直接作为消息发送给 Agent——比如点「提交」，等同于你在输入框里敲下「提交」并回车。新建但还没发过消息的会话不显示这一排：此时没有对话上下文，一键回复没有可承接的内容，等第一轮对话结束后它才出现。

最前面还会自动出现一条「下一步建议」：从 Agent 最后一条回答里提取动作。除有问号的收尾提问外，它也会读懂“登录完成后告诉我，我读取结果”这类没有问号的等待条件，并生成「登录完成」，以及“需要我发版的话说一声”这种提出代做的收尾句，生成「发版」。比如 Agent 说“直接说「继续修复编译」即可”，或“你只需要确认一句：「写这个工具」”，这一条就会作为建议 chip 排在所有命令之前，点一下即发送「继续修复编译」/「写这个工具」。建议是临时推导出来的，不写入你的命令列表。

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

- **会话空闲且已有对话时出现**：当前会话打开、Agent 不在运行、输入框里没有草稿时显示；运行中自动收起。
- **新会话与首页欢迎页不显示**：新建但还没发过消息的空白会话没有对话上下文，快捷行保持隐藏，首轮对话结束后出现；DSH 启动后连空白会话都还没创建时，宿主不渲染这个插槽，同样没有快捷行。
- **下一步建议置顶**：任务完成后，从 Agent 最后一条回答里提取动作，作为品牌色描边的箭头 chip 排在最前面；每轮回答后自动更新，提取不到或与已有命令重复时隐藏。它只存在于当前渲染中，不写入 `localStorage`，也不出现在管理面板。
- **点一下即发送**：通过公开的 `InputActions.setDraft()` 写入按钮文字，再调用 `InputActions.submit()` 提交，与手动输入后回车走同一条提交链路。
- **输入文字即收起**：输入框里一旦有草稿（包括手动输入、粘贴、`@` 引用等），快捷行立即隐藏；这次输入期间不再出现，直到下一轮任务完成后重新可用。
- **与输入框对齐**：快捷行使用宿主输入框卡片的宽度变量，同宽居中显示在其正上方。

## 预制命令

| 按钮 | 发送给 Agent 的内容 |
| --- | --- |
| 提交 | `提交` |
| 继续 | `继续` |
| 确认 | `确认` |

预制命令的文字固定，但可以在「管理」面板里删除；删除后永久消失，没有恢复入口（需要时清除站点数据，或编辑 `client.js` 顶部的 `BUILTIN` 后重新加载）。

## 下一步建议

快捷行最前面的那条建议不需要配置，它来自当前会话最后一条 Assistant 消息的收尾提问，或它等待你完成的前置事项。提取在浏览器内完成，不额外调用模型，也不改变你的命令列表。

支持的常见写法：

| Agent 的收尾句 | 建议 chip |
| --- | --- |
| `需要我继续把工程修到可编译状态的话，直接说“继续修复编译”即可。` | `继续修复编译` |
| `如果需要我继续修复，请回复「继续修复编译」。` | `继续修复编译` |
| `` 如果要继续，直接说 `npm test` 即可 `` | `npm test` |
| `直接回复 **继续修复编译**` | `继续修复编译` |
| `直接回复：继续修复编译` | `继续修复编译` |
| `你只需要确认一句：“写这个工具”。` | `写这个工具` |
| `你只需要确认一句「写这个工具」即可。` | `写这个工具` |
| `确认一下：写这个工具，我就开始实现。` | `写这个工具` |
| `我只需要你说一句“继续”。` | `继续` |
| `需要我继续把工程修到可编译状态吗？` | `继续把工程修到可编译状态` |
| `需要我继续修复吗？` | `继续修复` |
| `要不要我部署一下？` | `部署一下` |
| `要继续吗？` / `是否继续？` | `继续` |
| `需要我发版的话说一声。` | `发版` |
| `需要我继续修复的话告诉我` | `继续修复` |
| `还没打标签或推送（v1.3.0 + git push origin main --tags）。需要我发版的话说一声。` | `发版` |
| `登录完成后告诉我，我读取 C:\temp\frida 的结果。` | `登录完成` |
| `你登录好了跟我说一声` / `如果登录成功了，请告诉我` | `登录完成` |
| `等授权完成之后通知我` | `授权完成` |
| `装好依赖后告诉我` | `装好依赖` |
| `完成后告诉我` | `完成` |
| `If you'd like me to continue, reply "continue".` | `continue` |
| `Should I proceed with the fix?` | `Proceed with the fix` |
| `Let me know once you're logged in.` | `Logged in` |

规则与边界：

- 只读取最后一条带文字的 Assistant 消息，并从最后一句往前找；更早的回合不参与，避免把已经回答过的问题又提出来。
- 优先取“说 / 回复 / 回答 / 答复 / 确认 / 回 / 输入 / 发送 / say / reply / answer / confirm”等指令词后面、被 `“”`、`「」`、`『』`、反引号或 `**` 包住的动作；也接受引号后跟“即可 / 就行”，或以冒号直接给出回复的写法。指令词与回复之间的“一句 / 一句话 / 一下”和随后的冒号、逗号都算收尾。
- 冒号后面没有引号时，取冒号到第一个标点之间的短回复（最多 24 字，例如“确认一句：写这个工具，我就开始实现”取「写这个工具」）；中间含“是否 / 是不是 / 要不要 / 能不能 / 怎么样 / 如何 / 吗 / 呢”这类疑问词时不生成。
- 没有引号时，先解析“需要我……吗 / 要不要……吗 / 是否…… / Should I……?”这类问句，取其中的动作短语。
- 没有问号时，再识别等待条件：`X 完成 / 成功 / 好了 / 就绪（之后），告诉我 / 跟我说一声 / 通知我 / 回我 / 叫我`，以及 `完成 / 做完 / 搞定 X 后`、`X 后` 等句式；生成 `X 完成`（例如「登录完成」「授权完成」）。若 X 本身已含“装好 / 配好 / 弄好”这类完成词，则原样保留（例如「装好依赖」）。
- 没有问号时也识别“Agent 提出代做、等你一句话”的句式：`需要我 X / 要不要我 X / 我帮你 X 的话说一声 / 告诉我 / 跟我说一声 / 通知我`，直接取 X 作为回复（例如“需要我发版的话说一声”取「发版」），不会像等待条件那样补“完成”。
- 英文只处理 `Let me know / tell me / notify me once|when|after …` 中的登录类条件；其他英文等待句暂不生成。
- 结果会去掉引号、加粗符号和句末标点，最长 40 字；超长、纯标点、与现有预制或自定义命令完全相同的动作不会显示。以 `@` 开头的引用本身（例如 `@Quick-Command/`）不是一句回复，不会被提取成建议。
- 纯启发式匹配，不保证覆盖所有措辞；提不出可靠动作时这一条直接不出现，不会把整段回答当成命令塞进来。

## 管理命令

点「管理」后，面板按「预制命令 → 自定义命令」的顺序列出当前所有命令：

- **添加**：点「+ 添加」，输入文字后按 `Enter` 或「确定」；`Esc` 或「取消」放弃。空内容和与已有命令重复的文字会被拒绝，最长 40 字。
- **编辑**：自定义命令上点 `✎` 修改文字，`Enter` 保存、`Esc` 取消；预制命令不可编辑。
- **排序**：自定义命令上点 `↑` / `↓` 调整顺序；预制命令顺序固定。
- **删除**：任意命令上点 `×` 移除；预制命令删除后不会再出现。

预制命令的删除记录保存在 `localStorage` 的 `dsh-quick-commands.hidden`，自定义命令保存在 `dsh-quick-commands.custom`。两者都只属于当前浏览器配置，刷新或重启 DSH 后仍在；换浏览器、换设备或清除站点数据后不会保留。

## 测试

提取逻辑是 `client.js` 里的纯函数。测试用 Node 22 自带 runner，把 `client.js` 中标记为“leading suggestion”的纯函数段落求值后直接断言，不启动浏览器、不 mock 任何东西：

```bash
cd Quick-Command
npm test
```

新增措辞时先补一条用例（`test/suggestion.test.mjs`），确认它在旧实现上失败，再改 `client.js`。

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
- 依赖宿主提供的 `conversation.input.dock` 插槽、`InputActions.setDraft/submit()` 与 Session 作用域插槽的 `useChat()` 快照，不引入任何运行时依赖。

## 实现结构

| 插槽 | 作用域 | 内容 |
| --- | --- | --- |
| `conversation.input.dock` | session | 输入框卡片上方、与卡片同宽居中的条目，渲染快捷命令行 |

- 可见性来自 `useSession()`（`running` / `openState` / `blank`）和 `useInput()`（`phase` / `draft`），只订阅需要的切片；宿主的 `blank`（新会话标记）为真时整行不渲染，首轮对话结束后随 `blank` 变为 `false` 自动出现。
- 下一步建议用插槽自带的 `useChat()` 订阅 `legacy.nodes`，只把“最后一条 Assistant 文本”作为 selector 结果；提取函数是纯函数，文本不变就不重新计算，也不轮询。先找引号动作、冒号后的短回复和问句，再回退到“完成后告诉我”这类等待条件。
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
client.js             浏览器半边：快捷命令行、下一步建议提取、自定义命令管理与发送逻辑
test/suggestion.test.mjs  下一步建议提取的单元测试（node:test，只求值 client.js 的纯函数段落）
locale/zh.json        插件展示元数据（中文）
locale/en.json        插件展示元数据（英文）
icon.svg              图标
LICENSE               MIT 许可证
```
