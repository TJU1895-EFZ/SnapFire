import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/global.css'
import './styles/home.css'
import './styles/screens.css'
import './styles/long-march.css'
import './styles/battle.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing #root element')
}

ReactDOM.createRoot(root).render(<App />)
