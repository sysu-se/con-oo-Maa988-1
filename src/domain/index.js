// ============================================================
// Sudoku 领域对象
// ============================================================

/**
 * 深拷贝 9x9 grid
 */
function cloneGrid(grid) {
  return grid.map(row => [...row])
}

/**
 * 创建 Sudoku 对象
 * @param {number[][]} input - 9x9 的数独网格，0 表示空单元格
 * @returns {Sudoku}
 */
export function createSudoku(input) {
  // 防御性拷贝：创建时深拷贝输入
  let grid = cloneGrid(input)

  return {
    /**
     * 获取当前 grid 的副本
     */
    getGrid() {
      return cloneGrid(grid)
    },

    /**
     * 在指定位置填入数字
     * @param {{row: number, col: number, value: number}} move
     */
    guess(move) {
      const { row, col, value } = move
      
      // 验证参数边界
      if (row < 0 || row >= 9 || col < 0 || col >= 9) {
        throw new Error(`Invalid position: row=${row}, col=${col}`)
      }
      if (value < 0 || value > 9) {
        throw new Error(`Invalid value: ${value}`)
      }
      
      grid[row][col] = value
    },

    /**
     * 获取指定位置的值
     */
    getValue(row, col) {
      return grid[row][col]
    },

    /**
     * 克隆当前 Sudoku 对象
     */
    clone() {
      return createSudoku(grid)
    },

    /**
     * 序列化为 JSON
     */
    toJSON() {
      return {
        type: 'Sudoku',
        grid: cloneGrid(grid)
      }
    },

    /**
     * 返回人类可读的字符串表示
     */
    toString() {
      const separator = '+-------+-------+-------+'
      const lines = [separator]

      for (let i = 0; i < 9; i++) {
        let row = '| '
        for (let j = 0; j < 9; j++) {
          const val = grid[i][j]
          row += (val === 0 ? '.' : val.toString()) + ' '
          if ((j + 1) % 3 === 0) {
            row += '| '
          }
        }
        lines.push(row)
        if ((i + 1) % 3 === 0) {
          lines.push(separator)
        }
      }

      return lines.join('\n')
    }
  }
}

/**
 * 从 JSON 数据恢复 Sudoku 对象
 */
export function createSudokuFromJSON(json) {
  return createSudoku(json.grid)
}

// ============================================================
// Game 领域对象（管理 Undo/Redo 历史）
// ============================================================

/**
 * 创建 Game 对象
 * @param {{sudoku: Sudoku, undoStack?: Array, redoStack?: Array}} options
 * @returns {Game}
 */
export function createGame({ sudoku, undoStack = [], redoStack = [] }) {
  // 持有当前数独对象（克隆一份）
  let currentSudoku = sudoku.clone()

  // 历史记录：存储 Move 对象
  const _undoStack = [...undoStack]
  const _redoStack = [...redoStack]

  return {
    /**
     * 获取当前的 Sudoku 对象的副本
     * 返回克隆，防止外部修改内部状态
     */
    getSudoku() {
      return currentSudoku.clone()
    },

    /**
     * 执行猜测并记录到历史
     * @param {{row: number, col: number, value: number}} move
     */
    guess(move) {
      // Undo 后若进行新的输入，Redo 历史应失效
      _redoStack.length = 0

      // 记录操作前的旧值
      const oldValue = currentSudoku.getValue(move.row, move.col)

      // 保存 Move 到 undo 历史
      _undoStack.push({
        row: move.row,
        col: move.col,
        oldValue: oldValue,
        newValue: move.value
      })

      // 应用到当前数独
      currentSudoku.guess(move)
    },

    /**
     * 撤销最近一次操作
     */
    undo() {
      if (_undoStack.length === 0) return

      const move = _undoStack.pop()

      // 恢复到旧值
      currentSudoku.guess({
        row: move.row,
        col: move.col,
        value: move.oldValue
      })

      // 将操作移到 redo 历史
      _redoStack.push(move)
    },

    /**
     * 重做被撤销的操作
     */
    redo() {
      if (_redoStack.length === 0) return

      const move = _redoStack.pop()

      // 恢复到新值
      currentSudoku.guess({
        row: move.row,
        col: move.col,
        value: move.newValue
      })

      // 将操作移回 undo 历史
      _undoStack.push(move)
    },

    /**
     * 检查是否可以撤销
     */
    canUndo() {
      return _undoStack.length > 0
    },

    /**
     * 检查是否可以重做
     */
    canRedo() {
      return _redoStack.length > 0
    },

    /**
     * 序列化为 JSON
     */
    toJSON() {
      return {
        type: 'Game',
        sudoku: currentSudoku.toJSON(),
        undoStack: [..._undoStack],
        redoStack: [..._redoStack]
      }
    }
  }
}

/**
 * 从 JSON 数据恢复 Game 对象
 */
export function createGameFromJSON(json) {
  const sudoku = createSudokuFromJSON(json.sudoku)
  
  // 直接创建带有历史记录的 Game
  return createGame({ 
    sudoku, 
    undoStack: json.undoStack || [], 
    redoStack: json.redoStack || [] 
  })
}
