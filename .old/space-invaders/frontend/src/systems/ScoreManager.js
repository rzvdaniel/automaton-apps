import { STORAGE_KEYS } from '../config.js'

export class ScoreManager {
  constructor(initialHighScore = 0) {
    this._score = 0
    this._lives = 3
    this._highScore = initialHighScore
  }

  addScore(points) {
    this._score += points
    return this._score
  }

  loseLife() {
    this._lives -= 1
    return this._lives
  }

  setLives(n) {
    this._lives = n
  }

  setScore(value) {
    this._score = value
  }

  persistHighScore() {
    if (this._score > this._highScore) {
      this._highScore = this._score
      localStorage.setItem(STORAGE_KEYS.highScore, String(this._highScore))
    }
  }

  reset() {
    this._score = 0
    this._lives = 3
  }

  isGameOver() {
    return this._lives <= 0
  }

  get score() { return this._score }
  get lives() { return this._lives }
  get highScore() { return this._highScore }
}
