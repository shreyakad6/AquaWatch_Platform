import Dashboard from './Dashboard'
import './index.css'
import { DashboardProvider } from './context/DashboardContext'
import { BrowserRouter } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <DashboardProvider>
        <Dashboard />
      </DashboardProvider>
    </BrowserRouter>
  )
}

export default App
