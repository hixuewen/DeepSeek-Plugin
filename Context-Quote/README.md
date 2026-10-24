# Context Quote

把内容引用到输入框：选中对话里的任意一段文字、选中右侧打开的代码文件里的片段，或者在右侧资源管理器里右键一个文件或目录，都会得到 `引用`。点一下，内容就进入输入框，光标落到插入内容之后，可以直接接着写。

## 安装

需要 DSH（`@deepseek-ai/dsh`）宿主。本插件在 `0.2.1-rc.2` 上加载、HMR 重载与插槽注册验证通过。

一条命令装进目标 profile（下例为 `web`，换成其他 profile 名同理）：

```sh
dsh plugin --profile web add "github:hixuewen/DeepSeek-Plugin#path:Context-Quote"
```

`#path:Context-Quote` 不能省略：插件包位于仓库子目录，仓库根没有 `package.json`。

也可以先克隆仓库，再从本地目录安装：

```sh
git clone https://github.com/hixuewen/DeepSeek-Plugin.git
dsh plugin --profile web add link:/绝对路径/DeepSeek-Plugin/Context-Quote
```

两种方式都会把本包写进该 profile 的 `dsh.profile.bundles`，插件自带的 `cordis.patch.yml` 随
bundle 自动挂载，不需要手工编辑任何配置。

安装后**重启 `dsh web`**，刷新页面即可生效。

卸载：

```sh
dsh plugin --profile web remove @local/dsh-context-quote
```

## 行为

### 对话选区

- **只认对话正文**：只有在会话消息区域内的选区才会触发；输入框、设置页、侧边栏里的选中文字不受影响。
- **不打断选区**：按下按钮时不会清空浏览器选区，所以点击后取到的永远是你看中的那段文字。
- **引用格式**：每行加 `>` 变成 Markdown 引用块，末尾留一个空行方便接着写问题。

  ```
  > 被引用的原话
  ```

- **自动分割线**：输入框里已经有内容时，新引用前面自动补一条 `---`，多条引用自然隔开：

  ```markdown
  > 第一条引用

  ---

  > 第二条引用

  ```

### 右侧代码片段

- **只认代码与纯文本预览**：右侧文档预览里的代码文件、纯文本文件选中后浮出 `引用`；Markdown、图片、PDF 等其他预览保持自己的选择行为。
- **引用 chip + 代码块**：先插入一个真正的 `@文件` 引用 chip（和手动 `@` 补全插入的 chip 完全一致：文件图标 + 文件名，不显示 `@` 字符；底层引用仍是完整路径），再插入带语言标注的围栏代码块：

  ````
  @src/foo.ts

  ```ts
  const answer = 42;
  ```
  ````

- **围栏自适应**：代码块的反引号数量会避开选中内容自带的连续反引号，不会提前闭合。
- **语言按扩展名**：`.ts`、`.py`、`.rs`、`.json` 等常见扩展名自动带上语言；未知扩展名用无标注代码块。

### 资源管理器右键

- **只接管文件与目录行**：右键右侧文件树里的文件行或目录行才弹出自定义菜单；加载提示、失败提示、空白区域保留浏览器原生右键行为。
- **菜单内容**：菜单在根级浮层里渲染，显示 `引用` 和条目名（目录带尾斜杠，如 `src/`）。点击后插入与原生 `@` 补全一致的引用 chip。点击外部、滚动、改变窗口大小或按 `Esc` 关闭。
- **目录引用**：右键目录插入的是目录引用 chip——文件夹图标、标签带尾斜杠（`src/`），底层引用为 `@src/`。这正是 `@` 补全语法里区分目录与文件的写法，提交后对话里的目录引用同样按文件夹渲染。目录行本身照常支持左键展开/收起。
- **路径处理**：条目在工作区内时尽量使用工作区相对路径；工作区外保留绝对路径；路径含空格自动使用引用语法——文件为 `@"path with spaces"`，目录为 `@"path with spaces/"`（尾斜杠保留在引号内）。

### 通用写入行为

- **追加而不是覆盖**：所有内容都通过输入框的公开动作面写入——`insertReference()` 插入引用 chip，`insertText()` 插入代码块，光标处追加，输入框里原有的文字、`@文件` / `@目录/` 引用 chip、以及正在进行的 `/命令` 状态都不会被破坏。
- **自动补空格**：光标紧跟在非空白字符后面时，先补一个空格再插入引用，避免出现 `前文@file` 这种粘连。
- **焦点回到输入框**：插入完成后把键盘交回输入框，光标停在插入内容之后。焦点通过会话输入门面 `conversation.input.for(binding.ctx).focus()` 归还——直接对 contenteditable 调 DOM `focus()` 会把光标丢到草稿开头。会话已提交/已销毁时静默跳过。
- **无会话时不显示**：没有选中会话（也就没有输入框）时不出现按钮和菜单。

## 实现结构

浏览器半边注册五个插槽条目，落在四个插槽上：

| 插槽 | 作用域 | 内容 |
| --- | --- | --- |
| `shell.overlay` | root | 可见的浮动 `引用` 按钮（跟随选区定位），以及文件/目录右键菜单浮层 |
| `conversation.input.overlay` | session | 不可见的桥接组件，把当前会话稳定的 `inputActions` 动作面发布给上面的按钮 |
| `sidebar.right.tab.files.actions` | session | 不可见的锚点：监听文件树文件/目录行的 `contextmenu`，发布右键菜单请求 |
| `sidebar.right.tab.document.actions` | session | 不可见的锚点：把当前预览的文件路径与写入动作发布给浮动按钮 |

`shell.overlay` 是 root 作用域，拿不到会话的输入动作面；文件树和预览所在的两个 session 级动作插槽直接提供 `inputActions`、`sessionId`，由它们把「写什么、写到哪个会话」发布给根浮层。会话桥接只负责对话选区的引用。浮动按钮本身不订阅草稿；文件树/预览锚点在点击时从会话输入状态里读取草稿，只用来判断插入点前是否需要补空格。

文件树与预览都通过宿主自己渲染的 `data-*` 属性定位（`data-files-root` / `data-files-entry="file"|"directory"` / `data-files-path`、`data-textpreview-url` / `data-code-preview` / `data-textpreview-plain`）；除了这两个不可见锚点，不修改宿主 DOM。

样式只用宿主主题 token（`--dsw-alias-*`）。

## 文件

```
package.json          包清单 + dsh.bundle / dsh.client 声明
cordis.patch.yml      插入插件行（id: context-quote）
index.js              Host 半边：不注册任何东西（纯浏览器行为）
client.js             浏览器半边：选区检测、浮动按钮、右键菜单、引用写入
locale/en.json        插件展示元数据（英文）
locale/zh.json        插件展示元数据（中文）
icon.svg              图标
```
