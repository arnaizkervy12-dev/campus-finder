
import { useState } from 'react'
import {
  ArrowRight,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { supabase } from './lib/supabaseClient.js'

export default function Auth({ recoveryMode = false, onPasswordUpdated }) {
  const [mode, setMode] = useState('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [recoveryComplete, setRecoveryComplete] = useState(false)

  const isSignup = mode === 'signup'
  const isForgot = mode === 'forgot'
  const isRecovery = recoveryMode

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    const cleanEmail = email.trim().toLowerCase()

    // Validate password reset form
    if (isRecovery) {
      if (password.length < 8) {
        setErrorMessage('Your new password must be at least 8 characters long.')
        return
      }

      if (password !== confirmPassword) {
        setErrorMessage('The passwords do not match.')
        return
      }
    }

    // Validate registration form
    if (isSignup && !fullName.trim()) {
      setErrorMessage('Please enter your full name.')
      return
    }

    if (!isForgot && !isRecovery && password.length < 8) {
      setErrorMessage('Your password must be at least 8 characters long.')
      return
    }

    if (isSignup && password !== confirmPassword) {
      setErrorMessage('The passwords do not match.')
      return
    }

    setLoading(true)

    try {
      // STEP 1: Set a new password after opening the recovery email
      if (isRecovery) {
        const { error } = await supabase.auth.updateUser({
          password,
        })

        if (error) throw error

        setPassword('')
        setConfirmPassword('')
        setSuccessMessage('Your password has been updated successfully.')
        setRecoveryComplete(true)
        return
      }

      // STEP 2: Send password reset email
      if (isForgot) {
        if (!cleanEmail) {
          setErrorMessage('Please enter your email address.')
          return
        }

        const { error } = await supabase.auth.resetPasswordForEmail(
          cleanEmail,
          {
            redirectTo: window.location.origin,
          }
        )

        if (error) throw error

        setSuccessMessage(
          'If an account exists with that email, a password reset link has been sent. Please check your inbox and Spam folder.'
        )
        return
      }

      // STEP 3: Register a new Student account
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: window.location.origin,
          },
        })

        if (error) throw error

        if (data.session) {
          setSuccessMessage(
            'Your account was created. Opening Campus Finder...'
          )
        } else {
          setSuccessMessage(
            'Registration successful! Check your email and click the confirmation link before logging in.'
          )
          setMode('login')
          setPassword('')
          setConfirmPassword('')
        }
      } else {
        // STEP 4: Normal login
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        })

        if (error) throw error
      }
    } catch (error) {
      setErrorMessage(
        error?.message || 'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setErrorMessage('')
    setSuccessMessage('')
    setPassword('')
    setConfirmPassword('')
  }

  const heading = isRecovery
    ? 'Set new password'
    : isForgot
      ? 'Forgot password?'
      : isSignup
        ? 'Create account'
        : 'Welcome back'

  const description = isRecovery
    ? 'Choose a new password for your account.'
    : isForgot
      ? 'Enter your registered email address and we will send you a reset link.'
      : isSignup
        ? 'Register to use the Campus Finder portal.'
        : 'Sign in to continue to Campus Finder.'

  return (
    <main className="min-h-screen bg-slate-950 text-slate-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl grid md:grid-cols-2">

        <section className="hidden md:flex flex-col justify-between bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-10 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-tr from-indigo-500 to-emerald-400 p-3">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xl font-extrabold">Campus Finder</div>
              <div className="text-xs text-indigo-200">
                School Lost &amp; Found Portal
              </div>
            </div>
          </div>

          <div className="py-12">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1.5 text-xs font-semibold text-indigo-200">
              <ShieldCheck className="h-4 w-4" />
              Student access
            </div>
            <h1 className="text-4xl font-black leading-tight">
              Find what’s lost. Return what’s found.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
              Sign in to browse school reports or create an account to post a
              lost or found item.
            </p>
          </div>

          <p className="text-xs text-slate-400">
            Use your school-approved email address.
          </p>
        </section>

        <section className="p-6 sm:p-10 md:p-12">
          <div className="mb-8 md:hidden flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-tr from-indigo-500 to-emerald-400 p-3 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-extrabold text-slate-900">
                Campus Finder
              </div>
              <div className="text-xs text-slate-500">
                School Lost &amp; Found Portal
              </div>
            </div>
          </div>

          <div className="mb-7">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
              {isRecovery || isForgot ? 'Account recovery' : 'Student account'}
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
              {heading}
            </h2>
            <p className="mt-2 text-sm text-slate-500">{description}</p>
          </div>

          {!isRecovery && (
            <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`rounded-lg px-3 py-2.5 transition ${
                  !isSignup
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Log in
              </button>

              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`rounded-lg px-3 py-2.5 transition ${
                  isSignup
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Register
              </button>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {errorMessage}
            </div>
          )}

          {successMessage && !recoveryComplete && (
            <div
              role="status"
              className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-800"
            >
              {successMessage}
            </div>
          )}

          {isRecovery && recoveryComplete ? (
            <div className="space-y-4">
              <div
                role="status"
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-800"
              >
                {successMessage}
              </div>

              <button
                type="button"
                onClick={onPasswordUpdated}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-indigo-700"
              >
                Continue to Campus Finder
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">

              {isSignup && (
                <div>
                  <label
                    htmlFor="fullName"
                    className="mb-1.5 block text-xs font-bold text-slate-700"
                  >
                    Full name
                  </label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="fullName"
                      type="text"
                      autoComplete="name"
                      required
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Enter your full name"
                      className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                </div>
              )}

              {!isRecovery && (
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1.5 block text-xs font-bold text-slate-700"
                  >
                    School email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@school.edu"
                      className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                </div>
              )}

              {!isForgot && (
                <div>
                  <label
                    htmlFor="password"
                    className="mb-1.5 block text-xs font-bold text-slate-700"
                  >
                    {isRecovery ? 'New password' : 'Password'}
                  </label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="password"
                      type="password"
                      autoComplete={
                        isSignup || isRecovery ? 'new-password' : 'current-password'
                      }
                      minLength={8}
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={
                        isSignup || isRecovery
                          ? 'At least 8 characters'
                          : 'Enter your password'
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                </div>
              )}

              {(isSignup || isRecovery) && (
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="mb-1.5 block text-xs font-bold text-slate-700"
                  >
                    Confirm password
                  </label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      placeholder="Re-enter your password"
                      className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                </div>
              )}

              {!isSignup && !isForgot && !isRecovery && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? 'Please wait...'
                  : isRecovery
                    ? 'Update password'
                    : isForgot
                      ? 'Send reset link'
                      : isSignup
                        ? 'Create student account'
                        : 'Log in'}

                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>

              {isForgot && (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="w-full text-sm font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Back to Login
                </button>
              )}
            </form>
          )}

          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
            Your account is managed securely by Supabase Authentication. Never
            share your password with anyone.
          </p>
        </section>
      </div>
    </main>
  )
}
