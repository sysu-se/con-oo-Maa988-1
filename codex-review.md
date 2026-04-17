# con-oo-Maa988-1 - Review

## Review 结论

当前提交体现出一定的领域封装意识，但 domain 与 Svelte 的实际接入没有闭环：棋盘状态被拆成并行来源，核心数独规则仍散落在 adapter/组件侧，且 store adapter 本身还存在明显的 Svelte 语义错误。因此它更接近“有领域对象、但未稳定成为真实 UI 核心”的半接入状态。

## 总体评价

| 维度 | 评价 |
| --- | --- |
| OOP | fair |
| JS Convention | poor |
| Sudoku Business | poor |
| OOD | poor |

## 缺点

### 1. 在普通 .js 模块中误用了 Svelte 的 $store 语法

- 严重程度：core
- 位置：src/stores/gameStore.js:121-170
- 原因：`$gamePaused` 只在 `.svelte` 组件中有编译期自动订阅语义，这里是普通 JS 模块；`$game.canUndo()`、`$game.canRedo()` 里的 `$game` 也根本没有定义。按静态阅读，这会让输入、撤销、重做、提示的守卫逻辑在运行时直接失效，说明 Svelte 接入链路并没有真正跑通。

### 2. UI 渲染的不是领域对象的当前棋盘，而是一个被手工拆开的并行 userGrid

- 严重程度：core
- 位置：src/stores/gameStore.js:68-118; src/components/Board/index.svelte:40-51
- 原因：开始游戏时 `grid` 被设为题面、`userGrid` 被清空，但棋盘组件遍历的是 `$userGrid`。这会让 givens 在初始渲染中缺席；而 `syncGameState()` 又会把完整棋盘塞回 `userGrid`，导致同一个 store 前后语义不一致。领域对象没有成为单一事实来源，也不符合“界面渲染当前局面来自领域对象”的要求。

### 3. 数独校验和胜负判定没有收敛到 Sudoku/Game 领域对象

- 严重程度：core
- 位置：src/domain/index.js:14-101; src/stores/gameStore.js:38-66; src/stores/gameStore.js:240-282
- 原因：`Sudoku` 目前只负责存格子和写值，没有提供冲突检测、完成判定等业务能力；`invalidCells` 和 `gameWon` 反而在 store adapter 里基于 `userGrid` 重新推导。这样把核心业务规则放在接入层，既不符合作业对 `Sudoku` 提供校验能力的要求，也削弱了 OOP/OOD 中“对象封装业务规则”的边界。

### 4. 笔记模式仍然向 Game 记录一次 guess(0)，把注记操作污染进主棋盘历史

- 严重程度：major
- 位置：src/components/Controls/Keyboard.svelte:13-21; src/domain/index.js:132-145
- 原因：在 notes 模式下，组件一边更新 `candidates`，一边仍调用 `gameStore.guess({ ..., value: 0 })`。这会把“加/删候选数”错误地建模成一次正式落子，污染 undo/redo 历史，也让领域模型无法区分棋盘状态与 UI 辅助状态。对数独业务来说，注记应独立于正式填数。

### 5. 接入层依赖的 @sudoku 模块在仓库静态内容中不可追踪

- 严重程度：major
- 位置：src/App.svelte:4-6; src/components/Board/index.svelte:3-4; src/components/Controls/ActionBar/Actions.svelte:9-10
- 原因：组件普遍从 `@sudoku/game`、`@sudoku/stores/game`、`@sudoku/stores/grid` 导入，但当前提交中看不到这些模块的实现，也看不到对应的 alias/dependency 定义。静态上无法闭合“组件 -> adapter -> domain”的真实代码路径，这说明关键接入代码至少没有完整体现在本次提交物里。

### 6. 部分适配层接口仍是占位或无效调用

- 严重程度：minor
- 位置：src/stores/gameStore.js:104-118; src/stores/gameStore.js:194-196
- 原因：`startCustom()` 里的 `difficulty.setCustom?.()` 对 writable store 来说不会更新任何状态，`fromJSON()` 也仍然是 TODO。说明 adapter API 还没有形成完整、一致、可落地的对外契约。

## 优点

### 1. 通过防御性拷贝保护内部状态

- 位置：src/domain/index.js:14-39; src/domain/index.js:67-78
- 原因：`createSudoku()`、`getGrid()`、`clone()` 都避免把内部 grid 引用直接暴露给外部，能防止 UI 绕过领域对象直接 mutate 棋盘，这一点符合 OOP 的封装目标。

### 2. 题面 givens 被明确建模为不可修改约束

- 位置：src/domain/index.js:41-58
- 原因：`givens` 被单独保存，并在 `guess()` 中阻止修改给定格。这比单纯依赖 UI 禁用更接近业务规则本身，数独约束被放进了领域对象。

### 3. Undo/Redo 采用 move delta 而非整盘快照

- 位置：src/domain/index.js:132-171
- 原因：`Game` 记录 `oldValue/newValue`，撤销重做只重放单步操作，职责边界清晰，空间开销也比频繁存整盘快照更合理。

### 4. 组件层已经开始把关键操作收口到统一入口

- 位置：src/components/Controls/Keyboard.svelte:19-27; src/components/Controls/ActionBar/Actions.svelte:24-29
- 原因：正式填数、撤销、重做不再直接改二维数组，而是改为调用 `gameStore`。虽然 adapter 目前实现还有问题，但接入方向本身是对的。

## 补充说明

- 本次结论完全基于静态阅读；未运行 build、未运行 test、也未实际点击 UI，因此所有关于流程是否可工作的判断都来自源码链路分析。
- 关于 `@sudoku/game`、`@sudoku/stores/game`、`@sudoku/stores/grid` 等模块的结论，基于当前提交中看不到其实现且看不到相应别名/依赖配置；如果这些文件存在于未提交的生成物或外部环境中，实际运行结果可能与本次静态结论不同。
- 评审范围限制在 `src/domain/*`、`src/stores/gameStore.js` 以及直接消费这些能力的 Svelte 入口与组件；未扩展到其他无关目录。
