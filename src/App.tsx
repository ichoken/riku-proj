import { useEffect, useRef, useState, type ReactElement } from 'react'
import './App.css'

type Vec2 = { x: number; y: number }

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}

export default function App(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastRef = useRef<number | null>(null)

  // input state
  const inputRef = useRef<Vec2>({ x: 0, y: 0 })
  const [joystickActive, setJoystickActive] = useState(false)

  // player state
  const playerRef = useRef({
    x: 200,
    y: 0,
    vy: 0,
    isGrounded: true,
    dir: 1,
    hp: 100,
  })

  // game objects
  const enemiesRef = useRef<Array<any>>([])
  const particlesRef = useRef<Array<any>>([])
  const lastAttackRef = useRef<number>(0)
  const groundYRef = useRef<number>(0)
  const gameOverRef = useRef(false)
  const [gameOver, setGameOver] = useState(false)
  const attackEffectsRef = useRef<Array<any>>([])

  // config
  const SPEED = 160 // px/sec
  const JUMP_SPEED = 360
  const GRAVITY = 1200
  const AIR_CONTROL = 0.6
  const ATTACK_COOLDOWN = 400 // ms
  const ATTACK_RANGE = 140 // px (player reach increased)
  const COLLIDE_RANGE = 36 // px (enemy-player collision)

  // joystick handling (unchanged)
  useEffect(() => {
    const base = document.getElementById('joy-base')!
    const knob = document.getElementById('joy-knob')!
    if (!base || !knob) return

    let activePointer: number | null = null
    function getRect() {
      return base.getBoundingClientRect()
    }
    const maxR = Math.min(getRect().width, getRect().height) / 2
    const deadZone = Math.max(6, maxR * 0.12)

    function setKnob(dx: number, dy: number) {
      const d = Math.hypot(dx, dy)
      const limited = d > maxR ? (maxR / d) : 1
      const nx = dx * limited
      const ny = dy * limited
      knob.style.transform = `translate(${nx}px, ${ny}px)`
    }

    function pointerDown(e: any) {
      if (activePointer !== null) return
      activePointer = e.pointerId
      try { (e.target as Element).setPointerCapture(activePointer!) } catch {}
      setJoystickActive(true)
      onPointerMove(e as any)
    }

    function onPointerMove(e: any) {
      if (activePointer !== e.pointerId) return
      const r = getRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      const dist = Math.hypot(dx, dy)
      if (dist < deadZone) {
        inputRef.current = { x: 0, y: 0 }
        setKnob(0, 0)
        return
      }
      const nx = dx / maxR
      const ny = dy / maxR
      inputRef.current = { x: clamp(nx, -1, 1), y: clamp(ny, -1, 1) }
      setKnob(dx, dy)
    }

    function pointerUp(e: any) {
      if (activePointer !== e.pointerId) return
      try { try { (e.target as Element).releasePointerCapture(activePointer!) } catch {} } catch {}
      activePointer = null
      inputRef.current = { x: 0, y: 0 }
      setKnob(0, 0)
      setJoystickActive(false)
    }

    base.addEventListener('pointerdown', pointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointercancel', pointerUp)

    return () => {
      base.removeEventListener('pointerdown', pointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', pointerUp)
      window.removeEventListener('pointercancel', pointerUp)
    }
  }, [])

  // jump button
  useEffect(() => {
    const btn = document.getElementById('jumpButton')!
    function onDown(e: PointerEvent) {
      e.preventDefault()
      const p = playerRef.current
      if (p.isGrounded) {
        p.vy = -JUMP_SPEED
        p.isGrounded = false
      }
    }
    btn.addEventListener('pointerdown', onDown)
    return () => btn.removeEventListener('pointerdown', onDown)
  }, [])

  // attack button (visual feedback + action)
  useEffect(() => {
    const btn = document.getElementById('attackButton')!
    function onAttack(e: PointerEvent) {
      e.preventDefault()
      doPlayerAttack(performance.now())
    }
    function onDown(e: PointerEvent) {
      ;(btn as HTMLButtonElement).classList.add('pressed')
      onAttack(e)
    }
    function onUp() {
      ;(btn as HTMLButtonElement).classList.remove('pressed')
    }
    if (btn) {
      btn.addEventListener('pointerdown', onDown)
      window.addEventListener('pointerup', onUp)
    }
    return () => {
      if (btn) {
        btn.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointerup', onUp)
      }
    }
  }, [])

  // keyboard support (adds attack keys)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        const p = playerRef.current
        if (p.isGrounded) {
          p.vy = -JUMP_SPEED
          p.isGrounded = false
        }
      }
      if (e.code === 'ArrowLeft' || e.key === 'a') {
        inputRef.current.x = -1
      }
      if (e.code === 'ArrowRight' || e.key === 'd') {
        inputRef.current.x = 1
      }
      // attack keys
      if (e.code === 'KeyX' || e.code === 'KeyZ' || e.code === 'KeyF') {
        doPlayerAttack(performance.now())
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key) || ['ArrowLeft', 'ArrowRight'].includes(e.code)) {
        inputRef.current.x = 0
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // spawn multiple enemies initially (3 enemies)
  useEffect(() => {
    spawnEnemies()
  }, [])

  function spawnEnemies() {
    const baseY = 0
    const startX = 600
    const arr: any[] = []
    for (let i = 0; i < 3; i++) {
      arr.push({
        id: i + 1,
        x: startX + i * 140,
        y: baseY,
        vx: 30 * (i % 2 === 0 ? 1 : -1),
        patrolLeft: startX + i * 140 - 80,
        patrolRight: startX + i * 140 + 80,
        alive: true,
      })
    }
    enemiesRef.current = arr
  }

  function restart() {
    gameOverRef.current = false
    setGameOver(false)
    // reset player
    const p = playerRef.current
    p.x = 200
    p.y = 0
    p.vy = 0
    p.isGrounded = true
    p.dir = 1
    // clear particles and attack effects
    particlesRef.current = []
    attackEffectsRef.current = []
    lastAttackRef.current = 0
    // respawn enemies
    spawnEnemies()
  }

  // attack logic (one-hit kill nearest enemy within range)
  function doPlayerAttack(nowMs: number) {
    if (nowMs - lastAttackRef.current < ATTACK_COOLDOWN) return
    lastAttackRef.current = nowMs
    const p = playerRef.current
    const enemies = enemiesRef.current
    const enemyY = groundYRef.current || p.y
    // find nearest alive enemy within range
    let best: any = null
    let bestDist = Infinity
    for (const e of enemies) {
      if (!e.alive) continue
      const dx = e.x - p.x
      const dy = (enemyY - p.y)
      const d = Math.hypot(dx, dy)
      if (d < ATTACK_RANGE && d < bestDist) {
        best = e
        bestDist = d
      }
    }
    if (best) {
      // one-shot kill
      best.alive = false
      // spawn visible attack effect near player so user sees the action
      const p = playerRef.current
      attackEffectsRef.current.push({ x: p.x + p.dir * 20, y: p.y - 20, life: 0.18 })
      // spawn particles (skin-colored small stars)
      spawnHitParticles(best.x, enemyY - 20)
    }
  }

  function spawnHitParticles(x: number, y: number) {
    const parts = particlesRef.current
    const count = 10
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2) * (i / count) + (Math.random() - 0.5) * 0.5
      const speed = 80 + Math.random() * 120
      parts.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life: 0.6 + Math.random() * 0.4,
        size: 4 + Math.random() * 4,
        color: '#f4c2b0', // 肌色っぽい
      })
    }
  }

  // main loop
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!

    function resize() {
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(canvas.clientWidth * dpr)
      canvas.height = Math.floor(canvas.clientHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    function step(ts: number) {
      if (lastRef.current == null) lastRef.current = ts
      const dt = Math.min(0.05, (ts - lastRef.current!) / 1000)
      lastRef.current = ts

      const p = playerRef.current
      // horizontal
      const inVec = inputRef.current
      const control = p.isGrounded ? 1 : AIR_CONTROL
      p.x += inVec.x * SPEED * control * dt
      if (inVec.x < 0) p.dir = -1
      else if (inVec.x > 0) p.dir = 1

      // vertical
      p.vy += GRAVITY * dt
      p.y += p.vy * dt

      // ground at 60% of canvas height
      const groundY = canvas.height / (window.devicePixelRatio || 1) * 0.6
      groundYRef.current = groundY
      if (p.y >= groundY) {
        p.y = groundY
        p.vy = 0
        p.isGrounded = true
      }

      // clamp within canvas
      p.x = clamp(p.x, 20, canvas.width / (window.devicePixelRatio || 1) - 20)

      // update enemies
      const enemies = enemiesRef.current
      for (const en of enemies) {
        if (!en.alive) continue
        const enemyY = groundY
        if (!gameOverRef.current) {
          en.x += en.vx * dt
          if (en.x < en.patrolLeft) { en.x = en.patrolLeft; en.vx = Math.abs(en.vx) }
          if (en.x > en.patrolRight) { en.x = en.patrolRight; en.vx = -Math.abs(en.vx) }
          // aggro: move toward player if close (use ground distance)
          const distToPlayer = Math.hypot(p.x - en.x, p.y - enemyY)
          if (distToPlayer < 140) {
            en.vx = Math.sign(p.x - en.x) * Math.abs(en.vx)
          }
          // if enemy touches player -> Game Over
          if (distToPlayer < COLLIDE_RANGE) {
            gameOverRef.current = true
            setGameOver(true)
          }
        }
      }

      // update particles
      const parts = particlesRef.current
      for (let i = parts.length - 1; i >= 0; i--) {
        const par = parts[i]
        par.vy += 800 * dt
        par.x += par.vx * dt
        par.y += par.vy * dt
        par.life -= dt
        if (par.life <= 0) parts.splice(i, 1)
      }

      // update attack effects
      const attackEff = attackEffectsRef.current
      for (let i = attackEff.length - 1; i >= 0; i--) {
        attackEff[i].life -= dt
        if (attackEff[i].life <= 0) attackEff.splice(i, 1)
      }

      // draw
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      // sky
      ctx.fillStyle = '#87CEEB'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      // ground
      ctx.fillStyle = '#6b8e23'
      ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY)

      // draw enemies
      for (const en of enemies) {
        if (!en.alive) continue
        drawEnemy(ctx, en.x, groundY, ts / 1000)
      }

      // draw player
      drawStickman(ctx, p.x, p.y, ts / 1000, p.dir, p.isGrounded)

      // draw attack effects (visible swing)
      for (const ae of attackEffectsRef.current) {
        const aalpha = Math.max(0, ae.life / 0.18)
        ctx.save()
        ctx.globalAlpha = aalpha
        ctx.fillStyle = 'rgba(255,255,180,0.95)'
        ctx.beginPath()
        // larger visual effect so reach feels impactful
        ctx.arc(ae.x, ae.y, 36 * aalpha + 10, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      // draw particles (small skin-colored stars)
      for (const par of parts) {
        drawStar(ctx, par.x, par.y, par.size, par.color, par.life / 0.8)
      }

      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div className="game-root">
      <canvas ref={canvasRef} className="game-canvas" />

      <div id="joy" className={`joy ${joystickActive ? 'active' : ''}`}>
        <div id="joy-base" className="joy-base">
          <div id="joy-knob" className="joy-knob" />
        </div>
      </div>

      <button id="attackButton" className="attack-button" aria-label="Attack">✶</button>
      <button id="jumpButton" className="jump-button" aria-label="Jump">↑</button>

      {gameOver && (
        <div className="overlay">
          <div className="overlay-box">
            <div style={{ fontSize: 28, marginBottom: 12 }}>Game Over</div>
            <button className="overlay-button" onClick={() => restart()}>Restart</button>
          </div>
        </div>
      )}
    </div>
  )
}

function drawStickman(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, dir: number, grounded: boolean) {
  // simple procedural stickman (unchanged)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(dir, 1)

  const headR = 10
  const bodyH = 30
  const armL = 18
  const legL = 20

  const walkSpeed = grounded ? 6 : 2
  const phase = Math.sin(t * walkSpeed)
  const armSwing = grounded ? phase * 0.6 : -0.4
  const legSwing = grounded ? phase * 1.0 : -0.6

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  ctx.beginPath()
  ctx.ellipse(0, bodyH + 12, 18, 6, 0, 0, Math.PI * 2)
  ctx.fill()

  // head
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(0, -bodyH - headR, headR, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#000'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'

  // body
  ctx.beginPath()
  ctx.moveTo(0, -bodyH)
  ctx.lineTo(0, 0)
  ctx.stroke()

  // arms
  ctx.beginPath()
  ctx.moveTo(0, -bodyH + 6)
  ctx.lineTo(armL * Math.cos(armSwing), -bodyH + 6 + armL * Math.sin(armSwing))
  ctx.moveTo(0, -bodyH + 6)
  ctx.lineTo(-armL * Math.cos(armSwing), -bodyH + 6 - armL * Math.sin(armSwing))
  ctx.stroke()

  // legs
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(legL * Math.sin(legSwing), legL * Math.cos(legSwing))
  ctx.moveTo(0, 0)
  ctx.lineTo(-legL * Math.sin(legSwing), legL * Math.cos(legSwing))
  ctx.stroke()

  ctx.restore()
}

function drawEnemy(ctx: CanvasRenderingContext2D, x: number, groundY: number, t: number) {
  // simple red stick enemy
  const headR = 8
  const bodyH = 26
  // head
  ctx.fillStyle = '#6b0b0b'
  ctx.beginPath()
  ctx.arc(x, groundY - bodyH - headR, headR, 0, Math.PI * 2)
  ctx.fill()
  // body
  ctx.strokeStyle = '#4b0b0b'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x, groundY - bodyH)
  ctx.lineTo(x, groundY)
  ctx.stroke()
  // legs
  ctx.beginPath()
  ctx.moveTo(x, groundY)
  ctx.lineTo(x + 8 * Math.sin(Math.sin(t * 6)), groundY + 12)
  ctx.moveTo(x, groundY)
  ctx.lineTo(x - 8 * Math.sin(Math.sin(t * 6)), groundY + 12)
  ctx.stroke()
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, color: string, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
  ctx.fillStyle = color
  ctx.translate(cx, cy)
  ctx.beginPath()
  const spikes = 5
  const outer = radius
  const inner = radius * 0.45
  for (let i = 0; i < spikes; i++) {
    const ang = (i * Math.PI * 2) / spikes
    const ang2 = ang + Math.PI / spikes
    ctx.lineTo(Math.cos(ang) * outer, Math.sin(ang) * outer)
    ctx.lineTo(Math.cos(ang2) * inner, Math.sin(ang2) * inner)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
