import { execSync } from 'child_process'
import { existsSync, rmSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const backend = path.join(root, 'backend')
const venvDir = path.join(backend, '.venv')
const isWin = process.platform === 'win32'
const py = isWin ? 'python' : 'python3'

const pythonWin = path.join(venvDir, 'Scripts', 'python.exe')
const pythonUnix = path.join(venvDir, 'bin', 'python3')
const pythonUnixAlt = path.join(venvDir, 'bin', 'python')

function venvPythonExists() {
  return isWin
    ? existsSync(pythonWin)
    : existsSync(pythonUnix) || existsSync(pythonUnixAlt)
}

if (existsSync(venvDir) && !venvPythonExists()) {
  console.log('Removing incompatible backend/.venv for this operating system...')
  rmSync(venvDir, { recursive: true, force: true })
}

if (!existsSync(venvDir)) {
  console.log('Creating Python virtualenv at backend/.venv...')
  execSync(`${py} -m venv "${venvDir}"`, { stdio: 'inherit', cwd: root, shell: true })
}

const pyExe = isWin
  ? pythonWin
  : existsSync(pythonUnix)
    ? pythonUnix
    : pythonUnixAlt

console.log('Installing Python dependencies...')
execSync(`"${pyExe}" -m pip install -r "${path.join(backend, 'requirements.txt')}"`, { stdio: 'inherit', shell: true })

console.log('Running migrations...')
execSync(`"${pyExe}" manage.py migrate`, { stdio: 'inherit', cwd: backend, shell: true })

console.log('Backend setup complete. Run: npm run dev')
