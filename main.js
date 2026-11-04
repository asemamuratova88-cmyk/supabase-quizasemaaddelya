const TABLE = 'вопросы'
const RESULTS_TABLE = 'результаты'
const NAME_MAX_LENGTH = 40
const NAME_KEY = 'robo-quiz-name'
const OPTION_KEYS = ['a', 'b', 'c']
const OPTION_LABELS = { a: 'А', b: 'Б', c: 'В' }

// correct_answer may hold a letter (Latin or Cyrillic) or the full option text
const LETTER_ALIASES = {
  a: 'a', а: 'a',
  b: 'b', б: 'b',
  c: 'c', с: 'c', в: 'c',
}

const THINKING = [
  'Хм, а ты как думаешь? 🤔',
  'Выбирай смело! Я в тебя верю ✨',
  'Подумай хорошенько 🧐',
  'Ого, интересный вопрос! 💡',
  'Ты точно справишься! 🚀',
]

const PRAISE = [
  'Супер! Ты молодец! 🌟',
  'Правильно! Так держать! 💪',
  'Вау, вот это знания! 🤩',
  'Блестяще! ✨',
  'Ура! Робик танцует от радости! 🕺',
  'Точно в цель! 🎯',
  'Да ты настоящий эксперт! 🧠',
  'Пять с плюсом! 🏅',
]

const ENCOURAGE = [
  'Почти получилось! В следующий раз точно выйдет 💪',
  'Ничего страшного, учимся вместе! 🌈',
  'Ошибаться не страшно — так мы и учимся! 📚',
  'Хорошая попытка! Запомним правильный ответ 😉',
  'Даже роботы иногда ошибаются! 🤖',
  'Не сдавайся, ты большой молодец! ⭐',
]

const ASK_NAME = [
  'Ой, сначала напиши своё имя — мне же интересно, с кем я играю! 😊',
  'Как тебя зовут? Напиши имя в окошке, и поехали! ✏️',
  'Я Робик, а ты? Напиши своё имя, пожалуйста 🙂',
]

const RESULTS = {
  3: {
    icon: '🏆',
    title: 'Ты настоящий гений!',
    robot: 'Вау! Я горжусь тобой! Ты знаешь про технологии почти всё! 🤩',
  },
  2: {
    icon: '🏅',
    title: 'Отличная работа!',
    robot: 'Супер! Ещё чуть-чуть — и будет три звезды! 💪',
  },
  1: {
    icon: '🎈',
    title: 'Хорошее начало!',
    robot: 'Каждая игра делает тебя умнее. Давай попробуем ещё раз! 🌈',
  },
}

const MOOD_BADGES = {
  hello: '👋',
  thinking: '❓',
  happy: '⭐',
  sad: '🤗',
  party: '🎉',
  loading: '⚙️',
  oops: '🔧',
}

const app = document.getElementById('app')
const musicButton = document.getElementById('music-toggle')
const sfxButton = document.getElementById('sfx-toggle')
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

const state = {
  all: [],
  questions: [],
  index: 0,
  score: 0,
  answered: false,
  playerName: '',
  gameId: 0,
  savedGameId: 0,
}

let db = null

/* ---------- helpers ---------- */

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (key === 'style') {
      for (const [name, styleValue] of Object.entries(value)) {
        node.style.setProperty(name, String(styleValue))
      }
    } else if (key === 'role' || key.startsWith('aria-') || key.startsWith('data-')) {
      node.setAttribute(key, value)
    } else {
      node[key] = value
    }
  }
  node.append(...children)
  return node
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
}

function correctKey(question) {
  const answer = normalize(question.correct_answer)
    .replace(/^option\s+/, '')
    .replace(/[\s.):]+$/, '')
  if (LETTER_ALIASES[answer]) return LETTER_ALIASES[answer]
  return OPTION_KEYS.find((key) => normalize(question[`option ${key}`]) === answer) ?? null
}

function shuffle(list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = copy[i]
    copy[i] = copy[j]
    copy[j] = temp
  }
  return copy
}

const lastPicked = new Map()

function pick(list) {
  let item
  do {
    item = list[Math.floor(Math.random() * list.length)]
  } while (list.length > 1 && item === lastPicked.get(list))
  lastPicked.set(list, item)
  return item
}

function plural(n, one, few, many) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

function restartAnimation(node, className) {
  node.classList.remove(className)
  void node.offsetWidth
  node.classList.add(className)
}

function readPref(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === '1'
  } catch {
    return fallback
  }
}

function savePref(key, value) {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // private mode: the choice just won't be remembered
  }
}

// Counts by code points so an emoji is never cut in half
function cleanName(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ')
  return Array.from(name).slice(0, NAME_MAX_LENGTH).join('').trim()
}

function readSavedName() {
  try {
    return cleanName(localStorage.getItem(NAME_KEY))
  } catch {
    return ''
  }
}

function saveName(name) {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // private mode: the name just won't be remembered
  }
}

/* ---------- sound (Web Audio API, no audio files) ---------- */

const AudioContextClass = window.AudioContext || window.webkitAudioContext
const MUSIC_VOLUME = 0.3
const STEP = 0.19

// 4-bar loop over C – Am – F – G, MIDI note numbers, null = pause
const MELODY = [
  76, null, 79, 76, 72, 74, 76, null,
  72, null, 76, 72, 69, 71, 72, null,
  69, 72, 77, 76, 74, 72, 74, null,
  71, 74, 79, 77, 76, 74, 71, null,
]
const BASS_ROOTS = [48, 45, 41, 43]
const BASS_PATTERN = [0, 12, 7, 12]

const sound = {
  ctx: null,
  musicBus: null,
  sfxBus: null,
  noise: null,
  musicOn: readPref('robo-quiz-music', true),
  sfxOn: readPref('robo-quiz-sfx', true),
  started: false,
  timer: null,
  nextNoteTime: 0,
  step: 0,
}

function frequency(midiNote) {
  return 440 * 2 ** ((midiNote - 69) / 12)
}

function unlockAudio() {
  if (!AudioContextClass) return
  try {
    if (!sound.ctx) {
      const ctx = new AudioContextClass()
      const compressor = ctx.createDynamicsCompressor()
      compressor.connect(ctx.destination)

      sound.musicBus = ctx.createGain()
      sound.musicBus.gain.value = 0
      sound.musicBus.connect(compressor)

      sound.sfxBus = ctx.createGain()
      sound.sfxBus.gain.value = 1
      sound.sfxBus.connect(compressor)

      const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate)
      const data = noise.getChannelData(0)
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
      sound.noise = noise

      sound.ctx = ctx
    }
    if (sound.ctx.state === 'suspended' && !document.hidden) {
      sound.ctx.resume().catch(() => {})
    }
  } catch {
    sound.ctx = null
  }
}

function tone(midiNote, time, duration, { type = 'triangle', volume = 0.2, bus = sound.sfxBus, slideTo = null } = {}) {
  const { ctx } = sound
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency(midiNote), time)
  if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(frequency(slideTo), time + duration)
  gain.gain.setValueAtTime(0.0001, time)
  gain.gain.exponentialRampToValueAtTime(volume, time + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration)
  osc.connect(gain)
  gain.connect(bus)
  osc.start(time)
  osc.stop(time + duration + 0.05)
}

function hiHat(time) {
  const { ctx } = sound
  const source = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  source.buffer = sound.noise
  filter.type = 'highpass'
  filter.frequency.value = 7000
  gain.gain.setValueAtTime(0.12, time)
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(sound.musicBus)
  source.start(time)
  source.stop(time + 0.06)
}

function scheduleMusic() {
  const { ctx } = sound
  if (sound.nextNoteTime < ctx.currentTime - 0.1) sound.nextNoteTime = ctx.currentTime + 0.05

  while (sound.nextNoteTime < ctx.currentTime + 0.25) {
    const step = sound.step % MELODY.length
    const time = sound.nextNoteTime
    const beat = step % 8
    const melodyNote = MELODY[step]

    if (melodyNote !== null) {
      tone(melodyNote, time, STEP * 0.9, { volume: 0.18, bus: sound.musicBus })
    }
    if (beat % 2 === 0) {
      const root = BASS_ROOTS[Math.floor(step / 8)]
      tone(root + BASS_PATTERN[beat / 2], time, STEP * 1.6, { volume: 0.22, bus: sound.musicBus })
    } else {
      hiHat(time)
    }

    sound.nextNoteTime += STEP
    sound.step += 1
  }
}

function applyMusic() {
  if (!sound.ctx) return
  const now = sound.ctx.currentTime
  const gain = sound.musicBus.gain
  gain.cancelScheduledValues(now)
  gain.setValueAtTime(gain.value, now)

  if (sound.musicOn && sound.started) {
    gain.setTargetAtTime(MUSIC_VOLUME, now, 0.15)
    if (!sound.timer) {
      sound.step = 0
      sound.nextNoteTime = now + 0.1
      scheduleMusic()
      sound.timer = setInterval(scheduleMusic, 60)
    }
  } else {
    gain.setTargetAtTime(0, now, 0.08)
    clearInterval(sound.timer)
    sound.timer = null
  }
}

function duckMusic(seconds) {
  if (!sound.ctx || !sound.timer) return
  const now = sound.ctx.currentTime
  const gain = sound.musicBus.gain
  gain.cancelScheduledValues(now)
  gain.setValueAtTime(gain.value, now)
  gain.setTargetAtTime(MUSIC_VOLUME * 0.2, now, 0.05)
  gain.setTargetAtTime(MUSIC_VOLUME, now + seconds, 0.3)
}

function sfxStartTime() {
  if (!sound.sfxOn || !sound.ctx) return null
  return sound.ctx.currentTime + 0.02
}

function playPop() {
  const t = sfxStartTime()
  if (t === null) return
  tone(81, t, 0.09, { type: 'sine', volume: 0.14, slideTo: 88 })
}

function playCorrect() {
  const t = sfxStartTime()
  if (t === null) return
  const notes = [72, 76, 79, 84]
  notes.forEach((note, i) => {
    const duration = i === notes.length - 1 ? 0.45 : 0.14
    tone(note, t + i * 0.08, duration, { type: 'square', volume: 0.06 })
    tone(note + 12, t + i * 0.08, duration, { type: 'triangle', volume: 0.12 })
  })
  tone(96, t + 0.36, 0.25, { type: 'sine', volume: 0.06 })
  tone(100, t + 0.44, 0.3, { type: 'sine', volume: 0.06 })
  duckMusic(0.8)
}

function playWrong() {
  const t = sfxStartTime()
  if (t === null) return
  tone(67, t, 0.16, { type: 'triangle', volume: 0.16 })
  tone(64, t + 0.17, 0.4, { type: 'triangle', volume: 0.16, slideTo: 60 })
  duckMusic(0.7)
}

function playFanfare() {
  const t = sfxStartTime()
  if (t === null) return
  const melody = [
    [67, 0, 0.12],
    [67, 0.14, 0.12],
    [67, 0.28, 0.12],
    [72, 0.42, 0.45],
    [76, 0.9, 0.14],
    [79, 1.05, 0.14],
    [84, 1.2, 1.0],
  ]
  melody.forEach(([note, at, duration]) => {
    tone(note, t + at, duration, { type: 'square', volume: 0.06 })
    tone(note, t + at, duration, { type: 'triangle', volume: 0.14 })
  })
  const chord = [60, 64, 67]
  chord.forEach((note) => tone(note, t + 1.2, 1.1, { type: 'triangle', volume: 0.08 }))
  duckMusic(2.6)
}

function updateSoundButtons() {
  musicButton.classList.toggle('is-off', !sound.musicOn)
  musicButton.setAttribute('aria-pressed', String(sound.musicOn))
  musicButton.title = sound.musicOn ? 'Выключить музыку' : 'Включить музыку'

  sfxButton.textContent = sound.sfxOn ? '🔊' : '🔇'
  sfxButton.classList.toggle('is-off', !sound.sfxOn)
  sfxButton.setAttribute('aria-pressed', String(sound.sfxOn))
  sfxButton.title = sound.sfxOn ? 'Выключить звуки' : 'Включить звуки'
}

musicButton.addEventListener('click', () => {
  sound.musicOn = !sound.musicOn
  savePref('robo-quiz-music', sound.musicOn)
  unlockAudio()
  applyMusic()
  updateSoundButtons()
})

sfxButton.addEventListener('click', () => {
  sound.sfxOn = !sound.sfxOn
  savePref('robo-quiz-sfx', sound.sfxOn)
  unlockAudio()
  updateSoundButtons()
  playPop()
})

document.addEventListener('visibilitychange', () => {
  if (!sound.ctx) return
  if (document.hidden) sound.ctx.suspend().catch(() => {})
  else sound.ctx.resume().catch(() => {})
})

/* ---------- confetti (canvas, no libraries) ---------- */

const CONFETTI_COLORS = ['#ff5c9a', '#ff9f1c', '#ffd43b', '#22c55e', '#3d9bff', '#7b5cff']

const confetti = {
  canvas: document.getElementById('confetti'),
  ctx: null,
  particles: [],
  running: false,
  last: 0,
  dpr: 1,
}
confetti.ctx = confetti.canvas.getContext('2d')

function resizeConfetti() {
  confetti.dpr = Math.min(window.devicePixelRatio || 1, 2)
  confetti.canvas.width = Math.round(window.innerWidth * confetti.dpr)
  confetti.canvas.height = Math.round(window.innerHeight * confetti.dpr)
}
resizeConfetti()
window.addEventListener('resize', resizeConfetti)

function burstConfetti(x, y, { count = 70, angle = -Math.PI / 2, spread = Math.PI / 1.6, speed = 11 } = {}) {
  if (reducedMotion.matches || !confetti.ctx) return
  for (let i = 0; i < count; i += 1) {
    const direction = angle + (Math.random() - 0.5) * spread
    const velocity = speed * (0.5 + Math.random() * 0.7)
    confetti.particles.push({
      x,
      y,
      vx: Math.cos(direction) * velocity,
      vy: Math.sin(direction) * velocity,
      size: 7 + Math.random() * 7,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      round: Math.random() < 0.3,
      life: 0,
      ttl: 90 + Math.random() * 60,
    })
  }
  if (!confetti.running) {
    confetti.running = true
    confetti.last = performance.now()
    requestAnimationFrame(drawConfetti)
  }
}

function drawConfetti(now) {
  const dt = Math.min(Math.max((now - confetti.last) / 16.67, 0), 3)
  confetti.last = now
  const { ctx, dpr } = confetti
  const width = window.innerWidth
  const height = window.innerHeight
  const drag = 0.985 ** dt

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  confetti.particles = confetti.particles.filter((p) => p.life < p.ttl && p.y < height + 50)

  for (const p of confetti.particles) {
    p.vy += 0.32 * dt
    p.vx *= drag
    p.vy *= drag
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.rotation += p.spin * dt
    p.life += dt

    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rotation)
    ctx.globalAlpha = Math.max(0, Math.min(1, (p.ttl - p.life) / 25))
    ctx.fillStyle = p.color
    if (p.round) {
      ctx.beginPath()
      ctx.arc(0, 0, p.size / 2.5, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
    }
    ctx.restore()
  }

  if (confetti.particles.length > 0) {
    requestAnimationFrame(drawConfetti)
  } else {
    confetti.running = false
    ctx.clearRect(0, 0, width, height)
  }
}

function celebrate(level) {
  for (let wave = 0; wave < level + 1; wave += 1) {
    setTimeout(() => {
      const width = window.innerWidth
      const height = window.innerHeight
      burstConfetti(0, height, { count: 60, angle: -Math.PI / 3, spread: Math.PI / 4, speed: 24 })
      burstConfetti(width, height, { count: 60, angle: (-2 * Math.PI) / 3, spread: Math.PI / 4, speed: 24 })
    }, wave * 450)
  }
  setTimeout(() => {
    burstConfetti(window.innerWidth / 2, window.innerHeight * 0.35, { count: 100, spread: Math.PI * 2, speed: 10 })
  }, 300)
}

/* ---------- mascot ---------- */

function createMascot(mood, text, { big = false, column = false } = {}) {
  const badge = el('span', { className: 'mascot__badge', 'aria-hidden': 'true' })
  const bot = el('div', { className: 'mascot' }, [
    el('span', { className: 'mascot__face', textContent: '🤖', 'aria-hidden': 'true' }),
    badge,
  ])
  const bubble = el('p', { className: 'bubble' })
  const root = el('div', { className: column ? 'mascot-row mascot-row--column' : 'mascot-row' }, [bot, bubble])

  function set(nextMood, nextText) {
    bot.className = big ? 'mascot mascot--big' : 'mascot'
    void bot.offsetWidth
    bot.classList.add(`mascot--${nextMood}`)
    badge.textContent = MOOD_BADGES[nextMood] ?? ''
    bubble.textContent = nextText
    restartAnimation(bubble, 'is-new')
  }

  set(mood, text)
  return { root, set }
}

/* ---------- screens ---------- */

function showScreen(name, children) {
  app.className = `card card--${name}`
  app.replaceChildren(...children)
  void app.offsetWidth
  app.classList.add('is-entering')
  window.scrollTo(0, 0)
}

function renderLoading() {
  const mascot = createMascot('loading', 'Робик ищет вопросы…', { big: true, column: true })
  showScreen('loading', [mascot.root])
}

function renderError(error) {
  const mascot = createMascot('oops', 'Ой-ой! Что-то пошло не так…', { big: true, column: true })
  showScreen('message', [
    mascot.root,
    el('h1', { className: 'title title--small', textContent: 'Не получилось загрузить вопросы' }),
    el('p', { className: 'lead', textContent: 'Проверь интернет и попробуй ещё раз. Робик подождёт! 🙂' }),
    el('button', {
      type: 'button',
      className: 'btn',
      textContent: 'Попробовать снова 🔄',
      onclick: () => init(),
    }),
    el('p', {
      className: 'hint',
      textContent: `Для взрослых: ${error?.message || String(error)}`,
    }),
  ])
}

function renderEmpty() {
  const mascot = createMascot('thinking', 'Хм… а где же вопросы?', { big: true, column: true })
  showScreen('message', [
    mascot.root,
    el('h1', { className: 'title title--small', textContent: 'Вопросов пока нет' }),
    el('p', { className: 'lead', textContent: 'Скоро здесь появятся интересные вопросы! ✨' }),
    el('p', {
      className: 'hint',
      textContent:
        'Для учителя: добавьте вопросы в таблицу «вопросы» в Supabase и проверьте, что для неё есть политика RLS, разрешающая чтение.',
    }),
  ])
}

function renderStart() {
  const count = state.all.length
  const mascot = createMascot(
    'hello',
    'Привет! Я Робик. Давай узнаем, как много ты знаешь о роботах, компьютерах и искусственном интеллекте!',
    { big: true, column: true }
  )

  const nameInput = el('input', {
    id: 'player-name',
    className: 'name-input',
    type: 'text',
    name: 'name',
    placeholder: 'Твоё имя',
    maxLength: NAME_MAX_LENGTH,
    autocomplete: 'off',
    spellcheck: false,
    enterKeyHint: 'go',
    value: state.playerName || readSavedName(),
    oninput: () => {
      nameInput.classList.remove('is-invalid')
      nameInput.removeAttribute('aria-invalid')
    },
  })

  const form = el(
    'form',
    {
      className: 'name-form',
      noValidate: true,
      onsubmit: (event) => {
        event.preventDefault()
        unlockAudio()
        const name = cleanName(nameInput.value)
        if (!name) {
          nameInput.value = ''
          nameInput.setAttribute('aria-invalid', 'true')
          restartAnimation(nameInput, 'is-invalid')
          mascot.set('thinking', pick(ASK_NAME))
          nameInput.focus()
          return
        }
        state.playerName = name
        saveName(name)
        sound.started = true
        applyMusic()
        playPop()
        startGame()
      },
    },
    [
      el('label', { className: 'name-label', htmlFor: 'player-name', textContent: 'Как тебя зовут? ✏️' }),
      nameInput,
      el('button', { type: 'submit', className: 'btn btn--start', textContent: 'Начать! 🚀' }),
    ]
  )

  showScreen('start', [
    el('h1', { className: 'title', textContent: 'Робо-Квиз' }),
    mascot.root,
    el('p', {
      className: 'lead',
      textContent: `Тебя ждут ${count} ${plural(count, 'вопрос', 'вопроса', 'вопросов')}. За каждый правильный ответ — звёздочка ⭐`,
    }),
    form,
    el('p', { className: 'hint', textContent: '🎵 Включи звук — будет весёлая музыка!' }),
  ])
}

function startGame() {
  state.gameId += 1
  state.questions = shuffle(state.all)
  state.index = 0
  state.score = 0
  renderQuestion()
}

function setProgress(progress, done, total) {
  const percent = total > 0 ? (done / total) * 100 : 0
  progress.style.setProperty('--p', `${percent}%`)
  progress.setAttribute('aria-valuenow', String(done))
}

function thinkingPhrase(index, total) {
  if (total > 1 && index === 0) return 'Поехали! Первый вопрос 🚀'
  if (total > 1 && index === total - 1) return 'Последний вопрос! Ты почти у финиша 🏁'
  return pick(THINKING)
}

function renderQuestion() {
  const question = state.questions[state.index]
  const total = state.questions.length
  const rightKey = correctKey(question)
  const isLast = state.index + 1 >= total
  state.answered = false

  const scorePill = el('span', { className: 'pill pill--score', textContent: `⭐ ${state.score}` })

  const progress = el(
    'div',
    {
      className: 'progress',
      role: 'progressbar',
      'aria-label': 'Прогресс',
      'aria-valuemin': '0',
      'aria-valuemax': String(total),
    },
    [
      el('div', { className: 'progress__fill' }),
      el('span', { className: 'progress__goal', textContent: '🏁', 'aria-hidden': 'true' }),
      el('span', { className: 'progress__rocket', textContent: '🚀', 'aria-hidden': 'true' }),
    ]
  )
  setProgress(progress, state.index, total)

  const mascot = createMascot('thinking', thinkingPhrase(state.index, total))

  const buttons = {}
  const optionButtons = OPTION_KEYS.filter((key) => normalize(question[`option ${key}`])).map((key, i) => {
    const mark = el('span', { className: 'option__mark', 'aria-hidden': 'true' })
    const button = el(
      'button',
      {
        type: 'button',
        className: `option option--${key}`,
        style: { '--i': i },
        onclick: () => choose(key),
      },
      [
        el('span', { className: 'option__letter', textContent: OPTION_LABELS[key] }),
        el('span', { className: 'option__text', textContent: String(question[`option ${key}`]).trim() }),
        mark,
      ]
    )
    buttons[key] = { button, mark }
    return button
  })

  const feedback = el('p', { className: 'feedback', 'aria-live': 'polite' })

  const nextButton = el('button', {
    type: 'button',
    className: 'btn btn--next',
    hidden: true,
    textContent: isLast ? 'Узнать результат 🏁' : 'Дальше ➜',
    onclick: () => {
      playPop()
      state.index += 1
      if (state.index < total) renderQuestion()
      else renderResult()
    },
  })

  showScreen('question', [
    el('div', { className: 'topbar' }, [
      el('span', { className: 'pill', textContent: `Вопрос ${state.index + 1} из ${total}` }),
      el('span', { className: 'pill pill--player', textContent: `🙂 ${state.playerName}` }),
      scorePill,
    ]),
    progress,
    mascot.root,
    el('h1', { className: 'question', textContent: String(question.question).trim() }),
    el('div', { className: 'options' }, optionButtons),
    feedback,
    el('div', { className: 'actions' }, [nextButton]),
  ])

  function choose(key) {
    if (state.answered) return
    state.answered = true
    unlockAudio()

    const picked = buttons[key]
    const right = buttons[rightKey]
    Object.values(buttons).forEach(({ button }) => (button.disabled = true))

    if (key === rightKey) {
      state.score += 1
      picked.button.classList.add('is-correct')
      picked.mark.textContent = '✅'
      scorePill.textContent = `⭐ ${state.score}`
      restartAnimation(scorePill, 'is-bumped')
      mascot.set('happy', pick(PRAISE))
      feedback.className = 'feedback feedback--good'
      feedback.textContent = 'Правильно! Ты получаешь звёздочку ⭐'
      playCorrect()
      const rect = picked.button.getBoundingClientRect()
      burstConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2, {
        count: 60,
        spread: Math.PI * 1.2,
        speed: 9,
      })
    } else {
      picked.button.classList.add('is-wrong')
      picked.mark.textContent = '❌'
      if (right) {
        right.button.classList.add('is-correct')
        right.mark.textContent = '✅'
      }
      mascot.set('sad', pick(ENCOURAGE))
      feedback.className = 'feedback feedback--oops'
      feedback.textContent = right
        ? `Правильный ответ — ${OPTION_LABELS[rightKey]}: «${String(question[`option ${rightKey}`]).trim()}»`
        : 'Ничего страшного, идём дальше!'
      playWrong()
    }

    Object.values(buttons).forEach(({ button }) => {
      if (!button.classList.contains('is-correct') && !button.classList.contains('is-wrong')) {
        button.classList.add('is-dim')
      }
    })

    setProgress(progress, state.index + 1, total)
    nextButton.hidden = false
    nextButton.focus({ preventScroll: true })
    nextButton.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' })
  }
}

function renderResult() {
  const total = state.questions.length
  const ratio = total > 0 ? state.score / total : 0
  const level = ratio >= 0.85 ? 3 : ratio >= 0.5 ? 2 : 1
  const result = RESULTS[level]
  const mascot = createMascot('party', result.robot, { column: true })

  const stars = [0, 1, 2].map((i) =>
    el('span', {
      className: i < level ? 'star is-earned' : 'star',
      textContent: '⭐',
      style: { '--i': i },
    })
  )

  const saveStatus = el('p', { className: 'save-status', 'aria-live': 'polite' })

  showScreen('result', [
    el('div', { className: 'trophy', textContent: result.icon, 'aria-hidden': 'true' }),
    el('h1', { className: 'title title--result', textContent: result.title }),
    el('p', { className: 'player', textContent: `Игрок: ${state.playerName}` }),
    el('div', { className: 'stars', role: 'img', 'aria-label': `Звёзд: ${level} из 3` }, stars),
    el('p', { className: 'final-label', textContent: 'Правильных ответов' }),
    el('p', { className: 'final-score' }, [
      el('span', { className: 'final-score__num', textContent: String(state.score) }),
      ` из ${total}`,
    ]),
    saveStatus,
    mascot.root,
    el('button', {
      type: 'button',
      className: 'btn btn--start',
      textContent: 'Играть ещё раз 🔄',
      onclick: () => {
        playPop()
        startGame()
      },
    }),
    el('button', {
      type: 'button',
      className: 'link-btn',
      textContent: '👋 Другой игрок? Сменить имя',
      onclick: () => {
        playPop()
        renderStart()
        document.getElementById('player-name')?.select()
      },
    }),
  ])

  playFanfare()
  celebrate(level)
  saveResult(saveStatus)
}

function setSaveStatus(node, kind, text) {
  node.className = `save-status save-status--${kind}`
  node.textContent = text
}

async function saveResult(statusNode) {
  if (state.savedGameId === state.gameId) return
  state.savedGameId = state.gameId

  const row = {
    name: state.playerName,
    score: state.score,
    total: state.questions.length,
  }
  setSaveStatus(statusNode, 'pending', 'Сохраняем результат…')

  try {
    if (!db) throw new Error('Supabase client is not ready')
    const { error } = await db.from(RESULTS_TABLE).insert(row)
    if (error) throw error
    setSaveStatus(statusNode, 'ok', 'Результат сохранён ✅')
  } catch (error) {
    console.error('Не удалось сохранить результат:', error)
    setSaveStatus(statusNode, 'error', 'Не получилось сохранить результат, но ты молодец! 💖')
  }
}

/* ---------- start ---------- */

async function init() {
  renderLoading()
  try {
    const { supabase } = await import('./supabaseClient.js')
    db = supabase
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('id', { ascending: true })

    if (error) throw error
    state.all = (data ?? []).filter((row) => normalize(row.question))
  } catch (error) {
    renderError(error)
    return
  }

  if (state.all.length === 0) {
    renderEmpty()
    return
  }

  renderStart()
}

updateSoundButtons()
init()

