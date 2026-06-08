import './styles.css'

const state = {
  items: [],
  mode: window.automatonApi?.callController ? 'SQLite backend' : 'browser fallback',
}

const storageKey = 'automaton.todo-list.dev'

const todoForm = document.querySelector('#todo-form')
const titleInput = document.querySelector('#todo-title')
const todoList = document.querySelector('#todo-list')
const template = document.querySelector('#todo-item-template')
const totalCount = document.querySelector('#total-count')
const activeCount = document.querySelector('#active-count')
const completedCount = document.querySelector('#completed-count')
const clearCompletedButton = document.querySelector('#clear-completed')
const statusBanner = document.querySelector('#status-banner')

function createLocalApi() {
  const read = () => {
    const raw = window.localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw) : []
  }

  const write = (items) => {
    window.localStorage.setItem(storageKey, JSON.stringify(items))
    return { items }
  }

  return {
    async callController(_controller, action, inputs = {}) {
      const items = read()

      if (action === 'list') {
        return { items }
      }

      if (action === 'create') {
        const title = String(inputs.title || '').trim()
        if (!title) {
          throw new Error('title is required')
        }

        const item = {
          id: crypto.randomUUID(),
          title,
          completed: false,
          createdAt: new Date().toISOString(),
        }

        return write([item, ...items])
      }

      if (action === 'toggle') {
        return write(items.map((item) => item.id === inputs.id ? { ...item, completed: !item.completed } : item))
      }

      if (action === 'remove') {
        return write(items.filter((item) => item.id !== inputs.id))
      }

      if (action === 'clear_completed') {
        return write(items.filter((item) => !item.completed))
      }

      throw new Error(`Unknown action: ${action}`)
    },
  }
}

const api = window.automatonApi?.callController ? window.automatonApi : createLocalApi()

function setStatus(message, type = 'info') {
  statusBanner.hidden = !message
  statusBanner.textContent = message
  statusBanner.dataset.type = type
}

function getModeMessage() {
  return state.mode === 'SQLite backend'
    ? 'Connected to the Automaton SQLite backend.'
    : 'Running in browser fallback mode until the backend is available.'
}

function render() {
  todoList.innerHTML = ''

  for (const item of state.items) {
    const fragment = template.content.cloneNode(true)
    const row = fragment.querySelector('.todo-item')
    const checkbox = fragment.querySelector('.toggle-input')
    const text = fragment.querySelector('.todo-text')
    const deleteButton = fragment.querySelector('.delete-button')

    row.dataset.id = item.id
    checkbox.checked = item.completed
    text.textContent = item.title

    if (item.completed) {
      row.classList.add('is-complete')
    }

    checkbox.addEventListener('change', () => runAction('toggle', { id: item.id }))
    deleteButton.addEventListener('click', () => runAction('remove', { id: item.id }))

    todoList.appendChild(fragment)
  }

  const completed = state.items.filter((item) => item.completed).length
  totalCount.textContent = String(state.items.length)
  completedCount.textContent = String(completed)
  activeCount.textContent = String(state.items.length - completed)
  clearCompletedButton.disabled = completed === 0
}

async function loadTodos() {
  try {
    const data = await api.callController('todos', 'list', {})
    state.items = data.items
    setStatus(getModeMessage())
    render()
  } catch (error) {
    setStatus(error.message, 'error')
  }
}

async function runAction(action, inputs) {
  try {
    const data = await api.callController('todos', action, inputs)
    state.items = data.items
    setStatus(getModeMessage())
    render()
  } catch (error) {
    setStatus(error.message, 'error')
  }
}

todoForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const title = titleInput.value.trim()
  if (!title) {
    setStatus('Please enter a task title.', 'error')
    return
  }

  await runAction('create', { title })
  todoForm.reset()
  titleInput.focus()
})

clearCompletedButton.addEventListener('click', async () => {
  await runAction('clear_completed', {})
})

loadTodos()
