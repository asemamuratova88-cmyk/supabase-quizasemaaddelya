import { supabase } from './supabaseClient.js'

const TABLE = 'вопросы'
const OPTION_KEYS = ['a', 'b', 'c']
const OPTION_LABELS = { a: 'А', b: 'Б', c: 'В' }

// correct_answer may hold a letter (Latin or Cyrillic) or the full option text
const LETTER_ALIASES = {
  a: 'a', а: 'a',
  b: 'b', б: 'b',
  c: 'c', с: 'c', в: 'c',
}

const app = document.getElementById('app')

const state = {
  questions: [],
  index: 0,
  score: 0,
  answered: false,
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag)
  Object.assign(node, props)
  node.append(...children)
  return node
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
}

function correctKey(question) {
  const answer = normalize(question.correct_answer).replace(/^option\s+/, '')
  if (LETTER_ALIASES[answer]) return LETTER_ALIASES[answer]
  return OPTION_KEYS.find((key) => normalize(question[`option ${key}`]) === answer) ?? null
}

async function loadQuestions() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('id', { ascending: true })

  if (error) throw error
  return data
}

function renderMessage(title, text) {
  app.replaceChildren(el('h1', { textContent: title }), el('p', { textContent: text }))
}

function renderQuestion() {
  const question = state.questions[state.index]
  const rightKey = correctKey(question)
  state.answered = false

  const options = OPTION_KEYS.map((key) =>
    el('button', {
      className: 'option',
      textContent: `${OPTION_LABELS[key]}. ${question[`option ${key}`] ?? ''}`,
      onclick: (event) => choose(key, rightKey, event.currentTarget),
    })
  )

  const nextButton = el('button', {
    className: 'next',
    textContent: state.index + 1 < state.questions.length ? 'Следующий вопрос' : 'Результат',
    disabled: true,
    onclick: () => {
      state.index += 1
      state.index < state.questions.length ? renderQuestion() : renderResult()
    },
  })

  app.replaceChildren(
    el('p', {
      className: 'progress',
      textContent: `Вопрос ${state.index + 1} из ${state.questions.length}`,
    }),
    el('h1', { textContent: question.question }),
    el('div', { className: 'options' }, options),
    nextButton
  )

  function choose(key, right, button) {
    if (state.answered) return
    state.answered = true

    if (key === right) {
      state.score += 1
      button.classList.add('correct')
    } else {
      button.classList.add('wrong')
      const rightIndex = OPTION_KEYS.indexOf(right)
      if (rightIndex !== -1) options[rightIndex].classList.add('correct')
    }

    options.forEach((option) => (option.disabled = true))
    nextButton.disabled = false
  }
}

function renderResult() {
  app.replaceChildren(
    el('h1', { textContent: 'Квиз завершён' }),
    el('p', {
      className: 'score',
      textContent: `Правильных ответов: ${state.score} из ${state.questions.length}`,
    }),
    el('button', {
      className: 'next',
      textContent: 'Пройти ещё раз',
      onclick: () => {
        state.index = 0
        state.score = 0
        renderQuestion()
      },
    })
  )
}

async function start() {
  try {
    state.questions = await loadQuestions()
  } catch (error) {
    renderMessage('Не удалось загрузить вопросы', error.message)
    return
  }

  if (state.questions.length === 0) {
    renderMessage(
      'Вопросов пока нет',
      'Добавьте вопросы в таблицу «вопросы» и проверьте, что для неё есть политика RLS, разрешающая чтение.'
    )
    return
  }

  renderQuestion()
}

start()
