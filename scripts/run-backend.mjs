import { spawn } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backend = path.join(__dirname, '..', 'backend')

function findVenvPython() {
  const isWin = process.platform === 'win32'
  if (isWin) {
    const p = path.join(backend, '.venv', 'Scripts', 'python.exe')
    return existsSync(p) ? p : null
  }
  for (const name of ['python3', 'python']) {
    const p = path.join(backend, '.venv', 'bin', name)
    if (existsSync(p)) return p
  }
  return null
}

const venvPy = findVenvPython()
const python = venvPy || (process.platform === 'win32' ? 'python' : 'python3')
const proc = spawn(python, ['manage.py', 'runserver'], {
  cwd: backend,
  stdio: 'inherit',
  shell: false,
})
proc.on('exit', (code) => process.exit(code ?? 0))
