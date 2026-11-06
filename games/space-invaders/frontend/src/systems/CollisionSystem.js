export function rectFromCenter(entity) {
  return {
    left: entity.x - entity.width / 2,
    right: entity.x + entity.width / 2,
    top: entity.y - entity.height / 2,
    bottom: entity.y + entity.height / 2
  }
}

export function rectFromTopLeft(entity) {
  return {
    left: entity.x,
    right: entity.x + entity.width,
    top: entity.y,
    bottom: entity.y + entity.height
  }
}

export function intersects(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}
