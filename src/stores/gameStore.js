/**
 * Game Store Adapter
 * 连接领域对象与 Svelte 响应式系统的桥梁
 */

import { writable, derived } from 'svelte/store'
import { createGame, createSudoku } from '../domain/index.js'
import { generateSudoku, solveSudoku } from '@sudoku/sudoku'
import { decodeSencode, encodeSudoku } from '@sudoku/sencode'
import { SUDOKU_SIZE, BOX_SIZE } from '@sudoku/constants'

/**
 * 创建 Game Store
 * @param {object} options
 * @param {number[][]} [options.initialGrid] - 初始网格
 * @param {string} [options.sencode] - sencode 编码
 * @returns {object} Game Store 对象
 */
export function createGameStore(options = {}) {
  let game = null
  let sudoku = null

  const gamePaused = writable(true)
  const gameWon = writable(false)
  const canUndo = writable(false)
  const canRedo = writable(false)

  const grid = writable(createEmptyGrid())
  const userGrid = writable(createEmptyGrid())
  const invalidCells = writable([])

  const difficulty = writable('medium')
  const timer = writable(0)
  const timerRunning = writable(false)
  const hints = writable(Infinity)

  const derivedInvalidCells = derived(userGrid, $userGrid => {
    return calculateInvalidCells($userGrid)
  })

  derivedInvalidCells.subscribe($invalid => {
    invalidCells.set($invalid)
  })

  const derivedGameWon = derived(
    [userGrid, invalidCells],
    ([$userGrid, $invalidCells]) => {
      for (let row = 0; row < SUDOKU_SIZE; row++) {
        for (let col = 0; col < SUDOKU_SIZE; col++) {
          if ($userGrid[row][col] === 0) return false
        }
      }
      return $invalidCells.length === 0
    },
    false
  )

  derivedGameWon.subscribe($won => {
    gameWon.set($won)
    if ($won) {
      pauseGame()
    }
  })

  if (options.sencode) {
    const decodedGrid = decodeSencode(options.sencode)
    sudoku = createSudoku(decodedGrid)
    game = createGame({ sudoku })
    grid.set(decodedGrid)
    userGrid.set(createEmptyGrid())
  } else if (options.initialGrid) {
    sudoku = createSudoku(options.initialGrid)
    game = createGame({ sudoku })
    grid.set(options.initialGrid)
    userGrid.set(createEmptyGrid())
  } else {
    const emptyGrid = createEmptyGrid()
    sudoku = createSudoku(emptyGrid)
    game = createGame({ sudoku })
    grid.set(emptyGrid)
    userGrid.set(createEmptyGrid())
  }

  function startNew(diff) {
    difficulty.set(diff)
    const newGrid = generateSudoku(diff)

    sudoku = createSudoku(newGrid)
    game = createGame({ sudoku })

    grid.set(newGrid)
    userGrid.set(createEmptyGrid())
    gamePaused.set(false)
    gameWon.set(false)
    timer.set(0)
    hints.set(Infinity)

    location.hash = ''
  }

  function startCustom(sencode) {
    const decodedGrid = decodeSencode(sencode)

    sudoku = createSudoku(decodedGrid)
    game = createGame({ sudoku })

    difficulty.setCustom?.()
    grid.set(decodedGrid)
    userGrid.set(createEmptyGrid())
    gamePaused.set(false)
    gameWon.set(false)
    timer.set(0)
    hints.set(Infinity)

    location.hash = ''
  }

  function guess(move) {
    if (!game || $gamePaused) return

    game.guess(move)

    userGrid.update($userGrid => {
      $userGrid[move.row][move.col] = move.value
      return $userGrid
    })
  }

  function undo() {
    if (!game || !$game.canUndo() || $gamePaused) return

    game.undo()
    syncGameState()
  }

  function redo() {
    if (!game || !$game.canRedo() || $gamePaused) return

    game.redo()
    syncGameState()
  }

  function pauseGame() {
    gamePaused.set(true)
    timerRunning.set(false)
  }

  function resumeGame() {
    gamePaused.set(false)
    timerRunning.set(true)
  }

  function applyHint(row, col) {
    if (!game || $gamePaused) return

    const currentUserGrid = game.getSudoku().getGrid()
    const solvedGrid = solveSudoku(currentUserGrid)
    const hintValue = solvedGrid[row][col]

    game.guess({ row, col, value: hintValue })

    userGrid.update($userGrid => {
      $userGrid[row][col] = hintValue
      return $userGrid
    })

    hints.update(h => h - 1)
  }

  function syncGameState() {
    if (!game) return

    const currentGrid = game.getSudoku().getGrid()
    userGrid.set(currentGrid)
    canUndo.set(game.canUndo())
    canRedo.set(game.canRedo())
  }

  /**
   * 序列化当前游戏
   */
  function toJSON() {
    if (!game) return null
    return game.toJSON()
  }

  /**
   * 从 JSON 恢复游戏
   */
  function fromJSON(json) {
    // TODO: 实现反序列化
  }

  // ========== 返回 Store 对象 ==========

  return {
    // 响应式状态（UI 可以订阅）
    grid,
    userGrid,
    invalidCells,
    gamePaused,
    gameWon,
    canUndo,
    canRedo,
    difficulty,
    timer,
    timerRunning,
    hints,
    
    // 方法（UI 可以调用）
    startNew,
    startCustom,
    guess,
    undo,
    redo,
    pauseGame,
    resumeGame,
    applyHint,
    toJSON,
    fromJSON,
    
    // 内部方法（用于调试）
    getGame: () => game,
    getSudoku: () => sudoku
  }
}

/**
 * 创建空的 9x9 网格
 */
function createEmptyGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill(0))
}

/**
 * 计算无效的单元格
 */
function calculateInvalidCells(userGrid) {
  const invalidCells = []
  
  const addInvalid = (x, y) => {
    const xy = x + ',' + y
    if (!invalidCells.includes(xy)) invalidCells.push(xy)
  }
  
  for (let y = 0; y < SUDOKU_SIZE; y++) {
    for (let x = 0; x < SUDOKU_SIZE; x++) {
      const value = userGrid[y][x]
      
      if (value) {
        for (let i = 0; i < SUDOKU_SIZE; i++) {
          // Check the row
          if (i !== x && userGrid[y][i] === value) {
            addInvalid(x, y)
          }
          
          // Check the column
          if (i !== y && userGrid[i][x] === value) {
            addInvalid(x, i)
          }
        }
        
        // Check the box
        const startY = Math.floor(y / BOX_SIZE) * BOX_SIZE
        const endY = startY + BOX_SIZE
        const startX = Math.floor(x / BOX_SIZE) * BOX_SIZE
        const endX = startX + BOX_SIZE
        for (let row = startY; row < endY; row++) {
          for (let col = startX; col < endX; col++) {
            if (row !== y && col !== x && userGrid[row][col] === value) {
              addInvalid(col, row)
            }
          }
        }
      }
    }
  }
  
  return invalidCells
}

/**
 * 创建单例 Game Store
 * UI 将导入这个实例
 */
export const gameStore = createGameStore()

export default gameStore
