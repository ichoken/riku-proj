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
  const playerRef = useRef({ x: 200, y: 0, vy: 0, isGrounded: true, dir: 1 })

  // config
  const SPEED = 160 // px/sec
  const JUMP_SPEED = 360
  const GRAVITY = 1200
  const AIR_CONTROL = 0.6

  // joystick handling
  useEffect(() => {
    const base = document.getElementById('joy-base')!
    const knob = document.getElementById('joy-knob')!
    if (!base || !knob) return

    let activePointer: number | null = null
    function getRect() { return base.getBoundingClientRect() }
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
      try {
        try { (e.target as Element).releasePointerCapture(activePointer!) } catch {}
      } catch {}
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

  // keyboard support
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
      if (p.y >= groundY) {
        p.y = groundY
        p.vy = 0
        p.isGrounded = true
      }

      // clamp within canvas
      p.x = clamp(p.x, 20, canvas.width / (window.devicePixelRatio || 1) - 20)

      // draw
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      // sky
      ctx.fillStyle = '#87CEEB'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      // ground
      ctx.fillStyle = '#6b8e23'
      ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY)

      drawStickman(ctx, p.x, p.y, ts / 1000, p.dir, p.isGrounded)

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

      <button id="jumpButton" className="jump-button" aria-label="Jump">↑</button>
    </div>
  )
}

function drawStickman(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, dir: number, grounded: boolean) {
  // simple procedural stickman
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(dir, 1)

  // body parameters
  const headR = 10
  const bodyH = 30
  const armL = 18
  const legL = 20

  // walk animation (based on time and grounded)
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
