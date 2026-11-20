
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Auth from './Auth.jsx'
import { supabase } from './lib/supabaseClient.js'

function Root() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  useEffect(() => {
    let active = true

    // Listen for Supabase authentication events
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return

      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
      }

      if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false)
      }

      setSession(nextSession)
      setLoading(false)
    })

    // Load the current login session
    async function loadSession() {
      const { data, error } = await supabase.auth.getSession()

      if (!active) return

      if (error) {
        console.error('Could not load session:', error.message)
      }

      setSession(data?.session ?? null)
      setLoading(false)
    }

    loadSession()

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Sign out failed:', error.message)
    }
  }

  function handlePasswordUpdated() {
    setIsPasswordRecovery(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="text-sm text-slate-300">
          Loading Campus Finder...
        </p>
      </div>
    )
  }

  // Show the new password form after opening the recovery email
  if (isPasswordRecovery) {
    return (
      <Auth
        recoveryMode
        onPasswordUpdated={handlePasswordUpdated}
      />
    )
  }

  return session
    ? <App user={session.user} onSignOut={handleSignOut} />
    : <Auth />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
