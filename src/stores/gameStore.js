/**
 * Game Store Adapter
 * 
 * 这是连接领域对象与 Svelte 响应式系统的桥梁
 * 
 * 设计原理：
 * 1. 内部持有 Game / Sudoku 领域对象
 * 2. 使用 Svelte writable store 对外暴露响应式状态
 * 3. 提供方法供 UI 调用，这些方法会操作领域对象并更新 store
 * 4. UI 通过 $store 订阅状态，通过 store 方法操作领域对象
 * 
 * 为什么这样能工作：
 * - Svelte 的 writable store 具有 subscribe/update/set 方法
 * - 当调用 store.set() 或 store.update() 时，所有订阅者（包括 $store 语法）会自动收到通知
 * - UI 组件只需读取 $store 的值，调用 store.xxx() 方法
 * - 领域对象的变化通过 store 通知 UI，UI 不直接操作领域对象内部状态
 */

import { writable, derived } from 'svelte/store'
import { createGame, createSudoku } from '../domain/index.js'
import { generateSudoku, solveSudoku } from '@sudoku/sudoku'
import { decodeSencode, encodeSudoku } from '@sudoku/sencode'
import { SUDOKU_SIZE, BOX_SIZE } from '@sudoku/constants'

/**
 * 创建 Game Store
 * 
 * @param {object} options
 * @param {number[][]} options.initialGrid - 初始网格（可选）
 * @param {string} options.sencode - sencode 编码（可选）
 * 
 * @returns {object} Game Store 对象
 */
export function createGameStore(options = {}) {
  // 内部持有 Game 领域对象
  let game = null
  let sudoku = null

  // ========== 响应式状态（writable stores） ==========
  
  // 游戏状态
  const gamePaused = writable(true)
  const gameWon = writable(false)
  
  // Grid 数据（从领域对象派生）
  const grid = writable(createEmptyGrid())
  const userGrid = writable(createEmptyGrid())
  const invalidCells = writable([])
  
  // 游戏元数据
  const difficulty = writable('medium')
  const timer = writable(0)
  const timerRunning = writable(false)
  const hints = writable(Infinity)
  
  // ========== 派生状态（derived stores） ==========
  
  // 从 userGrid 派生 invalidCells
  const derivedInvalidCells = derived(userGrid, $userGrid => {
    return calculateInvalidCells($userGrid)
  })
  
  // 同步 invalidCells
  derivedInvalidCells.subscribe($invalid => {
    invalidCells.set($invalid)
  })
  
  // 检查游戏是否胜利
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

  // ========== 初始化 ==========
  
  if (options.sencode) {
    // 从 sencode 加载
    const decodedGrid = decodeSencode(options.sencode)
    sudoku = createSudoku(decodedGrid)
    game = createGame({ sudoku })
    grid.set(decodedGrid)
    userGrid.set(createEmptyGrid())
  } else if (options.initialGrid) {
    // 从初始网格加载
    sudoku = createSudoku(options.initialGrid)
    game = createGame({ sudoku })
    grid.set(options.initialGrid)
    userGrid.set(createEmptyGrid())
  } else {
    // 创建空游戏
    const emptyGrid = createEmptyGrid()
    sudoku = createSudoku(emptyGrid)
    game = createGame({ sudoku })
    grid.set(emptyGrid)
    userGrid.set(createEmptyGrid())
  }

  // ========== UI 可调用的方法 ==========

  /**
   * 开始新游戏（生成随机数独）
   */
  function startNew(diff) {
    difficulty.set(diff)
    const newGrid = generateSudoku(diff)
    
    // 创建新的领域对象
    sudoku = createSudoku(newGrid)
    game = createGame({ sudoku })
    
    // 更新响应式状态
    grid.set(newGrid)
    userGrid.set(createEmptyGrid())
    gamePaused.set(false)
    gameWon.set(false)
    timer.set(0)
    hints.set(Infinity)
    
    location.hash = ''
  }

  /**
   * 开始自定义游戏
   */
  function startCustom(sencode) {
    const decodedGrid = decodeSencode(sencode)
    
    // 创建新的领域对象
    sudoku = createSudoku(decodedGrid)
    game = createGame({ sudoku })
    
    // 更新响应式状态
    difficulty.setCustom?.()
    grid.set(decodedGrid)
    userGrid.set(createEmptyGrid())
    gamePaused.set(false)
    gameWon.set(false)
    timer.set(0)
    hints.set(Infinity)
    
    location.hash = ''
  }

  /**
   * 用户输入数字
   * @param {{row: number, col: number, value: number}} move
   */
  function guess(move) {
    if (!game || $gamePaused) return
    
    // 调用领域对象的方法
    game.guess(move)
    
    // 更新 UI 状态
    userGrid.update($userGrid => {
      $userGrid[move.row][move.col] = move.value
      return $userGrid
    })
  }

  /**
   * 撤销
   */
  function undo() {
    if (!game || !$game.canUndo() || $gamePaused) return
    
    // 调用领域对象的方法
    game.undo()
    
    // 从领域对象同步状态到 UI
    syncGameState()
  }

  /**
   * 重做
   */
  function redo() {
    if (!game || !$game.canRedo() || $gamePaused) return
    
    // 调用领域对象的方法
    game.redo()
    
    // 从领域对象同步状态到 UI
    syncGameState()
  }

  /**
   * 暂停游戏
   */
  function pauseGame() {
    gamePaused.set(true)
    timerRunning.set(false)
  }

  /**
   * 恢复游戏
   */
  function resumeGame() {
    gamePaused.set(false)
    timerRunning.set(true)
  }

  /**
   * 使用提示
   */
  function applyHint(row, col) {
    if (!game || $gamePaused) return
    
    const currentUserGrid = game.getSudoku().getGrid()
    const solvedGrid = solveSudoku(currentUserGrid)
    const hintValue = solvedGrid[row][col]
    
    // 调用 guess 填入提示
    game.guess({ row, col, value: hintValue })
    
    // 更新 UI
    userGrid.update($userGrid => {
      $userGrid[row][col] = hintValue
      return $userGrid
    })
    
    hints.update(h => h - 1)
  }

  /**
   * 从领域对象同步状态到 UI store
   * 这是关键方法：确保领域对象的变化反映到 UI
   */
  function syncGameState() {
    if (!game) return

    // 获取内部 sudoku 的 grid 副本
    const currentGrid = game.getSudoku().getGrid()

    // 同步 userGrid
    userGrid.set(currentGrid)
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
