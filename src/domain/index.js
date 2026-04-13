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
  let grid = cloneGrid(input)
  let _givens = givens || new Set()

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
    getGrid() {
      return cloneGrid(grid)
    },

    getGivens() {
      return new Set(_givens)
    },

    isGiven(row, col) {
      return _givens.has(`${row},${col}`)
    },

    guess(move) {
      const { row, col, value } = move

      if (row < 0 || row >= 9 || col < 0 || col >= 9) {
        throw new Error(`Invalid position: row=${row}, col=${col}`)
      }
      if (value < 0 || value > 9) {
        throw new Error(`Invalid value: ${value}`)
      }
      if (_givens.has(`${row},${col}`)) {
        throw new Error(`Cannot modify given cell at (${row}, ${col})`)
      }

      grid[row][col] = value
    },

    getValue(row, col) {
      return grid[row][col]
    },

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
  let currentSudoku = sudoku.clone()
  const _undoStack = [...undoStack]
  const _redoStack = [...redoStack]

  return {
    getSudoku() {
      return currentSudoku.clone()
    },

    guess(move) {
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

export function createGameFromJSON(json) {
  const sudoku = createSudokuFromJSON(json.sudoku)
  return createGame({
    sudoku,
    undoStack: json.undoStack || [],
    redoStack: json.redoStack || []
  })
}
