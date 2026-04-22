## HW 问题收集

列举在 HW1、HW1.1 过程里，我通过学习已经解决的问题，以及当前仓库里仍然存在、但我还没有完全理顺的挑战。

### 已解决

1. 理清了 `writable` 和 `derived` 的职责边界。
   1. **上下文**：[`src/stores/gameStore.js`](src/stores/gameStore.js)
   2. **解决手段**：对照 Svelte store 文档和代码阅读后，确认 `writable` 负责直接可变状态，`derived` 负责从现有状态推导结果；例如无效格子和胜负判断适合做派生状态，而不是手写同步多个来源。

2. 理解了领域对象为什么要做防御性拷贝。
   1. **上下文**：[`src/domain/index.js`](src/domain/index.js)
   2. **解决手段**：通过阅读 `createSudoku()`、`clone()`、`getGrid()` 的实现，弄清楚为什么不能把内部二维数组直接暴露给 UI。这样可以避免组件绕过领域对象直接修改棋盘，保证封装性。

3. 搞清楚了数独界面里“正式落子”和“候选数字”是两类不同操作。
   1. **上下文**：[`src/components/Controls/Keyboard.svelte`](src/components/Controls/Keyboard.svelte)
   2. **解决手段**：结合键盘输入和候选数逻辑阅读后，确认 notes 模式下应该先更新 candidates，再单独处理正式落子，否则会把注记错误写进游戏历史。

### 未解决

1. 普通 `.js` 模块里误用了 Svelte 的 `$store` 语法。
   1. **上下文**：[`src/stores/gameStore.js`](src/stores/gameStore.js)
   2. **尝试解决手段**：静态阅读时发现 `$gamePaused`、`$game.canUndo()`、`$game.canRedo()` 都出现在普通 JS 文件里，但它们只应该在 `.svelte` 组件中由编译器展开。目前我还没有把这段适配层改成完全正确的 Svelte store 用法。

2. 棋盘状态被拆成了并行来源，UI 还没有真正以领域对象为唯一事实源。
   1. **上下文**：[`src/stores/gameStore.js`](src/stores/gameStore.js)；[`src/components/Board/index.svelte`](src/components/Board/index.svelte)
   2. **尝试解决手段**：我已经确认初始化时存在 `grid`、`userGrid` 两套状态，而且棋盘渲染主要遍历的是 `$userGrid`。但目前还没有把“领域对象当前局面”统一收敛成唯一渲染来源。

3. 数独校验和胜负判定仍然主要在 store adapter 里推导。
   1. **上下文**：[`src/domain/index.js`](src/domain/index.js)；[`src/stores/gameStore.js`](src/stores/gameStore.js)
   2. **尝试解决手段**：我能看出 `invalidCells`、`gameWon` 这类核心规则还在 adapter 中由 `userGrid` 计算，但尚未完全迁移到 `Sudoku` / `Game` 领域对象内部，因此业务边界还不够清晰。