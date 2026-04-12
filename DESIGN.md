# Homework 1.1: 改进领域对象并接入 Svelte - 设计文档

## 一、领域对象如何被消费

### 1. View 层直接消费的是什么？

**答：View 层直接消费的是 `gameStore`（Store Adapter）。**

本方案采用 **Store Adapter 模式**，创建了一个 `gameStore` 单例对象：

- `gameStore` 内部持有 `Game` 和 `Sudoku` 领域对象
- `gameStore` 对外暴露 Svelte writable/derived stores（`grid`, `userGrid`, `gamePaused`, `gameWon` 等）
- UI 组件通过 `$gameStore.xxx` 或直接导入派生 stores 来订阅状态
- UI 组件通过调用 `gameStore.guess()`, `gameStore.undo()`, `gameStore.redo()` 等方法操作领域对象

**消费链路：**
```
UI 组件 (App.svelte, Board, Keyboard, Actions)
    ↓ 订阅
@sudoku/stores/grid.js (grid, userGrid, invalidCells)
    ↓ 派生自
src/stores/gameStore.js (gameStore.grid, gameStore.userGrid, gameStore.invalidCells)
    ↓ 内部持有
src/domain/index.js (Game 对象 → Sudoku 对象)
```

### 2. View 层拿到的数据是什么？

View 层通过 store 订阅获取以下数据：

| 数据 | 来源 | 用途 |
|------|------|------|
| `grid` | `gameStore.grid` | 初始数独网格（题目） |
| `userGrid` | `gameStore.userGrid` | 用户填写的网格（包含用户输入） |
| `invalidCells` | `gameStore.invalidCells` | 冲突的单元格列表（用于高亮） |
| `gamePaused` | `gameStore.gamePaused` | 游戏是否暂停 |
| `gameWon` | `gameStore.gameWon` | 游戏是否胜利 |
| `difficulty` | `gameStore.difficulty` | 难度设置 |
| `hints` | `gameStore.hints` | 剩余提示数 |

### 3. 用户操作如何进入领域对象？

**点击事件 → store 方法 → 领域对象**

以用户输入数字为例：

```
用户点击键盘 (Keyboard.svelte)
    ↓
调用 handleKeyButton(num)
    ↓
调用 gameStore.guess({ row: $cursor.y, col: $cursor.x, value: num })
    ↓
gameStore 内部调用 game.guess(move)（领域对象方法）
    ↓
gameStore 更新 userGrid.set(newGrid)
    ↓
Svelte 检测到 userGrid 变化，自动重新渲染 UI
```

**Undo/Redo 流程：**

```
用户点击 Undo 按钮 (Actions.svelte)
    ↓
调用 handleUndo() → gameStore.undo()
    ↓
gameStore 内部调用 game.undo()（领域对象方法）
    ↓
领域对象恢复状态后，gameStore 调用 syncGameState()
    ↓
syncGameState() 调用 userGrid.set(currentGrid)
    ↓
Svelte 检测到 userGrid 变化，自动重新渲染 UI
```

### 4. 领域对象变化后，Svelte 为什么会更新？

**核心原理：通过 writable store 的 `set()` / `update()` 方法触发响应式更新。**

Svelte 的 writable store 具有以下特性：

1. **订阅机制**：当组件使用 `$store` 语法时，Svelte 自动调用 `store.subscribe()` 订阅该 store
2. **通知机制**：当调用 `store.set(newValue)` 或 `store.update(fn)` 时，store 会通知所有订阅者
3. **自动更新**：Svelte 在编译时会将 `$store` 转换为订阅和更新逻辑，确保界面自动刷新

**在我们的方案中：**

```javascript
// gameStore 内部
function guess(move) {
  game.guess(move)  // 操作领域对象
  
  // 关键：调用 store.update() 触发 Svelte 响应式更新
  userGrid.update($userGrid => {
    $userGrid[move.row][move.col] = move.value
    return $userGrid
  })
}
```

UI 侧：
```svelte
<!-- Board/index.svelte -->
<script>
  import { userGrid } from '@sudoku/stores/grid';
</script>

{#each $userGrid as row, y}
  {#each row as value, x}
    <Cell {value} ... />
  {/each}
{/each}
```

当 `userGrid` 调用 `update()` 或 `set()` 时，Svelte 自动检测到 `$userGrid` 变化并重新渲染 `Cell` 组件。

---

## 二、响应式机制说明

### 1. 依赖的响应式机制

本方案依赖 **Svelte 3 的 store 机制**，具体包括：

- **writable store**：用于可变状态（`grid`, `userGrid`, `gamePaused` 等）
- **derived store**：用于从其他 store 派生的状态（`invalidCells`, `gameWon`）
- **`$store` 自动订阅语法**：UI 组件中使用 `$userGrid`, `$grid` 等

**不使用**：
- Svelte 5 runes
- Reactive classes
- `$:` reactive statements（仅在必要时用于派生逻辑）

### 2. 响应式暴露给 UI 的数据

| 数据类型 | Store 类型 | 暴露方式 |
|---------|-----------|---------|
| `grid` | writable | `gameStore.grid` → `@sudoku/stores/grid.grid` |
| `userGrid` | writable | `gameStore.userGrid` → `@sudoku/stores/grid.userGrid` |
| `invalidCells` | derived → writable | 从 `userGrid` 派生 |
| `gamePaused` | writable | `gameStore.gamePaused` → `@sudoku/stores/game.gamePaused` |
| `gameWon` | derived → writable | 从 `userGrid` + `invalidCells` 派生 |

### 3. 留在领域对象内部的状态

以下状态**不**直接暴露给 UI，而是留在领域对象内部：

- `Game` 的 `undoStack` 和 `redoStack`（历史记录）
- `Sudoku` 的内部 `grid` 数据（通过 `getGrid()` 访问副本）
- `Move` 历史（仅在 undo/redo 时使用）

**为什么不直接暴露？**
- 这些是领域对象的内部实现细节
- UI 不需要知道历史结构，只需调用 `undo()` / `redo()` 方法
- 通过 `canUndo()` / `canRedo()` 提供布尔状态即可（可选扩展）

### 4. 直接 mutate 内部对象会出现什么问题？

**如果直接 mutate 领域对象内部数据（如 `game.getSudoku().getGrid()[0][0] = 5`），会出现以下问题：**

1. **Svelte 不会检测到变化**
   - Svelte 的响应式系统依赖于 `store.set()` / `store.update()` 调用
   - 直接修改数组元素不会触发 store 的通知机制
   - 结果：数据已变，但界面不刷新

2. **破坏领域对象边界**
   - UI 直接操作内部状态，绕过了领域对象的业务逻辑
   - Undo/Redo 历史不会记录直接 mutate 的操作
   - 导致状态不一致

3. **浅拷贝/引用共享问题**
   - 如果 `getGrid()` 返回的是内部 grid 的引用，UI 修改会影响领域对象
   - 我们的方案中 `getGrid()` 返回深拷贝，避免了这个问题

**正确做法：**
```javascript
// ✅ 正确：通过 store 方法
gameStore.guess({ row: 0, col: 0, value: 5 })

// ❌ 错误：直接 mutate
const grid = game.getSudoku().getGrid()
grid[0][0] = 5  // 不会触发 UI 更新！
```

---

## 三、相比 HW1 的改进说明

### 1. 改进了什么？

| HW1 的问题 | HW1.1 的改进 |
|-----------|-------------|
| 领域对象只在测试中使用，UI 未接入 | 创建 `gameStore` 作为适配器，UI 真正消费领域对象 |
| UI 直接操作旧数组（`userGrid.set()`） | UI 通过 `gameStore.guess()` 调用领域对象 |
| Undo/Redo 逻辑散落在组件中 | Undo/Redo 完全由 `Game` 领域对象管理 |
| Store 各自为战，没有统一管理 | `gameStore` 作为单一数据源，其他 store 从中派生 |

### 2. 为什么 HW1 的做法不足以支撑真实接入？

HW1 中：
- `Sudoku` 和 `Game` 对象只在 `domain/index.js` 中定义
- UI 组件继续使用旧的 store 逻辑（`grid.js` 中的 `createGrid()` / `createUserGrid()`）
- 领域对象与 UI 之间没有连接，形成"两个平行系统"

**结果：**
- 领域对象成为"死代码"，只在测试中被调用
- 真实游戏流程不经过领域对象
- Undo/Redo 要么未实现，要么实现在组件中而非领域对象中

### 3. 新设计的 Trade-off

**优点：**
- ✅ **单一数据源**：领域对象是唯一的状态管理者
- ✅ **清晰的分层**：Domain → Store Adapter → UI
- ✅ **可测试性**：领域对象独立于 UI，可单独测试
- ✅ **向后兼容**：保留了原有 store 接口，UI 组件只需小改动

**缺点/权衡：**
- ⚠️ **状态同步开销**：领域对象变化后需要同步到 store（`syncGameState()`）
- ⚠️ **间接层**：UI 不直接操作 store，而是通过 `gameStore` 方法
- ⚠️ **学习曲线**：需要理解 store adapter 模式

**为什么选择 Store Adapter 而非领域对象直接实现订阅？**

1. **职责分离**：领域对象专注于业务逻辑，不关心 Svelte 框架细节
2. **可移植性**：`domain/index.js` 可以用于其他框架（React/Vue）
3. **灵活性**：可以在 adapter 层添加日志、验证、缓存等横切关注点

---

## 四、领域对象设计

### Sudoku 对象职责

- 持有 grid 数据（内部状态）
- 提供 `guess(move)` 方法修改局面
- 提供 `getGrid()` 方法获取副本（深拷贝）
- 提供 `clone()` 方法创建快照
- 提供 `toJSON()` / `toString()` 外表化接口

### Game 对象职责

- 持有当前 `Sudoku` 对象
- 管理 `undoStack` 和 `redoStack`（存储 Move 历史记录）
- 提供 `guess(move)`, `undo()`, `redo()` 方法
- 提供 `canUndo()`, `canRedo()` 状态查询
- 提供 `toJSON()` 序列化支持

### 复制策略

**History 中存储什么？**

存储 `Move` 对象，而非 `Sudoku` 快照：

```javascript
{
  row: number,
  col: number,
  oldValue: number,  // 操作前的值
  newValue: number   // 操作后的值
}
```

**为什么存储 Move 而非快照？**
- 节省内存：每个 Move 只有 4 个字段，而快照是整个 9x9 数组
- 撤销/重做效率高：只需应用单个 move，无需恢复整个快照
- 序列化体积小：`toJSON()` 只存储 move 历史，不存储多个网格副本

**深拷贝的使用场景：**
1. `createSudoku(input)` 时深拷贝输入 grid（防御性拷贝）
2. `getGrid()` 返回深拷贝（防止外部修改）
3. `clone()` 创建独立副本

**浅拷贝会导致的问题：**
- 如果 `getGrid()` 返回内部 grid 引用，外部修改会影响领域对象
- Undo 时 `oldValue` 可能已被外部代码修改，导致撤销到错误状态

---

## 五、文件结构

```
src/
├── domain/
│   └── index.js              # 领域对象：Sudoku / Game
├── stores/
│   └── gameStore.js          # Store Adapter（新增）
├── components/
│   ├── Board/
│   │   └── index.svelte      # 从 grid store 渲染
│   ├── Controls/
│   │   ├── Keyboard.svelte   # 调用 gameStore.guess()
│   │   └── ActionBar/
│   │       └── Actions.svelte # 调用 gameStore.undo()/redo()
└── node_modules/@sudoku/
    ├── game.js               # 使用 gameStore
    └── stores/
        ├── grid.js           # 从 gameStore 派生
        └── game.js           # 从 gameStore 派生
```

---

## 六、课堂讨论准备

### 1. View 层直接消费的是谁？

答：`gameStore`（Store Adapter），通过 `@sudoku/stores/grid` 和 `@sudoku/stores/game` 派生。

### 2. 为什么 UI 在领域对象变化后会刷新？

答：因为 `gameStore` 在操作领域对象后调用 `store.set()` / `store.update()`，触发 Svelte store 订阅者的更新回调。

### 3. 响应式边界在哪里？

答：响应式边界在 `gameStore` 的 store 对象（`gameStore.grid`, `gameStore.userGrid` 等）。领域对象内部状态不响应式，通过 store 方法桥接到响应式系统。

### 4. 哪些状态对 UI 可见，哪些不可见？

**可见**：`grid`, `userGrid`, `invalidCells`, `gamePaused`, `gameWon`
**不可见**：`undoStack`, `redoStack`, `Sudoku` 内部 grid

### 5. 如果迁移到 Svelte 5，哪层最稳定？

**最稳定**：`domain/index.js`（领域对象层）
- 纯 JavaScript，不依赖 Svelte
- 可以在任何框架中复用

**最可能改动**：`gameStore.js`（Store Adapter 层）
- 需要改用 Svelte 5 的 runes（`$state`, `$derived`）
- 但接口可以保持不变，对 UI 层透明
