/**
 * 深拷贝 9x9 grid
 */
function cloneGrid(grid) {
  return grid.map(row => [...row])
}

/**
 * 创建 Sudoku 对象
 * @param {number[][]} input - 9x9 的数独网格，0 表示空单元格
 * @param {Set<string>} [givens] - 题目给定的格子位置集合
 * @returns {Sudoku}
 */
export function createSudoku(input, givens) {
  // 防御性拷贝：避免外部修改影响内部状态
  let grid = cloneGrid(input)
  let _givens = givens || new Set()

  // 自动推断题目格子（非 0 的格子）
  if (!givens) {
    _givens = new Set()
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        if (input[i][j] !== 0) {
          _givens.add(`${i},${j}`)
        }
      }
    }
  }

  return {
    // 返回深拷贝，防止外部修改
    getGrid() {
      return cloneGrid(grid)
    },

    getGivens() {
      return new Set(_givens)
    },

    isGiven(row, col) {
      return _givens.has(`${row},${col}`)
    },

    // 在指定位置填入数字（包含参数验证）
    guess(move) {
      const { row, col, value } = move

      if (row < 0 || row >= 9 || col < 0 || col >= 9) {
        throw new Error(`Invalid position: row=${row}, col=${col}`)
      }
      if (value < 0 || value > 9) {
        throw new Error(`Invalid value: ${value}`)
      }
      // 禁止修改题目给定的格子
      if (_givens.has(`${row},${col}`)) {
        throw new Error(`Cannot modify given cell at (${row}, ${col})`)
      }

      grid[row][col] = value
    },

    getValue(row, col) {
      return grid[row][col]
    },

    // 克隆时保留 givens 信息
    clone() {
      return createSudoku(grid, new Set(_givens))
    },

    toJSON() {
      return {
        type: 'Sudoku',
        grid: cloneGrid(grid),
        givens: [..._givens]
      }
    },

    // 人类可读的字符串表示（用于调试）
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

// 从 JSON 恢复时重建 givens 集合
export function createSudokuFromJSON(json) {
  const givens = json.givens ? new Set(json.givens) : null
  return createSudoku(json.grid, givens)
}

// ============================================================
// Game 领域对象
// ============================================================

/**
 * 创建 Game 对象
 * @param {{sudoku: Sudoku, undoStack?: Array, redoStack?: Array}} options
 * @returns {Game}
 */
export function createGame({ sudoku, undoStack = [], redoStack = [] }) {
  // 克隆传入的 sudoku，避免外部引用泄漏
  let currentSudoku = sudoku.clone()
  const _undoStack = [...undoStack]
  const _redoStack = [...redoStack]

  return {
    // 返回克隆，防止外部绕过历史管理直接修改内部状态
    getSudoku() {
      return currentSudoku.clone()
    },

    // 执行猜测并记录历史（存储 oldValue 以支持正确撤销）
    guess(move) {
      // 新操作使 redo 历史失效
      _redoStack.length = 0

      const oldValue = currentSudoku.getValue(move.row, move.col)
      _undoStack.push({
        row: move.row,
        col: move.col,
        oldValue,
        newValue: move.value
      })

      currentSudoku.guess(move)
    },

    // 撤销：恢复到 oldValue
    undo() {
      if (_undoStack.length === 0) return

      const move = _undoStack.pop()
      currentSudoku.guess({
        row: move.row,
        col: move.col,
        value: move.oldValue
      })
      _redoStack.push(move)
    },

    // 重做：恢复到 newValue
    redo() {
      if (_redoStack.length === 0) return

      const move = _redoStack.pop()
      currentSudoku.guess({
        row: move.row,
        col: move.col,
        value: move.newValue
      })
      _undoStack.push(move)
    },

    canUndo() {
      return _undoStack.length > 0
    },

    canRedo() {
      return _redoStack.length > 0
    },

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

// 从 JSON 恢复时重建历史记录
export function createGameFromJSON(json) {
  const sudoku = createSudokuFromJSON(json.sudoku)
  return createGame({
    sudoku,
    undoStack: json.undoStack || [],
    redoStack: json.redoStack || []
  })
}
