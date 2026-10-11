# Context Quote

选中对话里的任意一段文字，就会在选区旁浮出 `引用` 按钮；点一下，这段文字就进入输入框、光标落到引用块之后，你可以直接针对它回复。

## 行为

- **只认对话正文**：只有在会话消息区域内的选区才会触发；输入框、设置页、侧边栏里的选中文字不受影响。
- **不打断选区**：按下按钮时不会清空浏览器选区，所以点击后取到的永远是你看中的那段文字。
- **追加而不是覆盖**：引用通过 `InputActions.captureInsertion()` + `insertText()` 写入，光标处插入，输入框里原有的文字、`@文件` 引用 chip、以及正在进行的 `/命令` 状态都不会被破坏。
- **焦点回到输入框**：插入完成后把键盘交回输入框，光标停在引用块之后，可以直接开始写回复。焦点通过会话输入门面 `conversation.input.for(binding.ctx).focus()` 归还——直接对 contenteditable 调 DOM `focus()` 会把光标丢到草稿开头。会话已提交/已销毁时静默跳过。
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

- **无会话时不显示**：没有选中会话（也就没有输入框）时不出现按钮。

## 实现结构

浏览器半边向两个插槽各投一份：

| 插槽 | 作用域 | 内容 |
| --- | --- | --- |
| `shell.overlay` | root | 可见的浮动 `引用` 按钮，跟随选区定位（`position: fixed`），滚动/缩放时重算 |
| `conversation.input.overlay` | session | 不可见的桥接组件，把当前会话稳定的 `inputActions` 动作面发布给上面的按钮 |

`shell.overlay` 是 root 作用域，拿不到会话的输入动作面；`conversation.input.overlay` 是唯一能拿到 `inputActions` 的合规座位。两者通过一个模块级发布订阅桥连接，草稿内容按需读取，不参与渲染，所以打字不会重渲染浮动按钮。

样式只用宿主主题 token（`--dsw-alias-*`）。

## 文件

```
package.json          包清单 + dsh.bundle / dsh.client 声明
cordis.patch.yml      插入插件行（id: context-quote）
index.js              Host 半边：不注册任何东西（纯浏览器行为）
client.js             浏览器半边：选区检测、浮动按钮、引用写入
locale/en.json        插件展示元数据（英文）
locale/zh.json        插件展示元数据（中文）
icon.svg              图标
```
