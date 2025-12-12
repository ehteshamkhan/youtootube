import { useEffect, useRef, useState } from 'react'
import type {
  ChangeEvent,
  FormEvent,
  MouseEvent,
  TouchEvent,
  WheelEvent,
} from 'react'
import './App.css'
import { supabase } from './supabaseClient'

type TabKey = 'trending' | 'your'
type VideoCategory = 'TRENDING' | 'YOUR'

interface Video {
  id: string
  title: string
  description: string
  url: string
  category: VideoCategory
}

interface Comment {
  id: string
  videoId: string
  author: string
  text: string
  createdAt: string
}

interface CurrentUser {
  id: string
  email: string
  username: string
}

const ALL_VIDEOS: Video[] = [
  {
    id: 'wowfinalfinal1',
    title: 'Epic Wow Final 1',
    description: 'Kicking things off with your first wowfinalfinal masterpiece.',
    url: 'https://mystorageaccount2306.blob.core.windows.net/videos/wowfinalfinal1.mp4',
    category: 'TRENDING',
  },
  {
    id: 'wowfinalfinal2',
    title: 'Epic Wow Final 2',
    description: 'The sequel that absolutely no one is ready for.',
    url: 'https://mystorageaccount2306.blob.core.windows.net/videos/wowfinalfinal2.mp4',
    category: 'TRENDING',
  },
  {
    id: 'wowfinalfinal3',
    title: 'Your Wow Final 3',
    description: 'Uploaded by you – flexing those video skills.',
    url: 'https://mystorageaccount2306.blob.core.windows.net/videos/wowfinalfinal3.mp4',
    category: 'YOUR',
  },
  {
    id: 'wowfinalfinal4',
    title: 'Your Wow Final 4',
    description: 'Another banger in your personal collection.',
    url: 'https://mystorageaccount2306.blob.core.windows.net/videos/wowfinalfinal4.mp4',
    category: 'YOUR',
  },
]

const LIKES_KEY = 'wowsite_likes_v1'
const USER_LIKES_KEY = 'wowsite_userlikes_v1'
const COMMENTS_KEY = 'wowsite_comments_v1'
const USER_AVATARS_KEY = 'wowsite_user_avatars_v1'

type LikesState = Record<string, number>
type UserLikesState = Record<string, string[]> // username -> videoIds
type UserAvatarState = Record<string, string> // userId -> dataUrl

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveToStorage<T>(key: string, value: T) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

function deriveUsername(email: string | null): string {
  if (!email) return 'mystery-creature'
  const [name] = email.split('@')
  return name || email
}

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('trending')
  const [currentIndex, setCurrentIndex] = useState(0)

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [likes, setLikes] = useState<LikesState>({})
  const [userLikes, setUserLikes] = useState<UserLikesState>({})
  const [comments, setComments] = useState<Comment[]>([])
  const [avatars, setAvatars] = useState<UserAvatarState>({})

  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [emailInput, setEmailInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authSuccess, setAuthSuccess] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)

  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  // Local storage hydration
  useEffect(() => {
    const storedLikes = loadFromStorage<LikesState>(LIKES_KEY, {})
    const storedUserLikes = loadFromStorage<UserLikesState>(USER_LIKES_KEY, {})
    const storedComments = loadFromStorage<Comment[]>(COMMENTS_KEY, [])
    const storedAvatars = loadFromStorage<UserAvatarState>(USER_AVATARS_KEY, {})

    setLikes(storedLikes)
    setUserLikes(storedUserLikes)
    setComments(storedComments)
    setAvatars(storedAvatars)
  }, [])

  useEffect(() => {
    saveToStorage(LIKES_KEY, likes)
  }, [likes])

  useEffect(() => {
    saveToStorage(USER_LIKES_KEY, userLikes)
  }, [userLikes])

  useEffect(() => {
    saveToStorage(COMMENTS_KEY, comments)
  }, [comments])

  useEffect(() => {
    saveToStorage(USER_AVATARS_KEY, avatars)
  }, [avatars])

  // Supabase auth: get current user + listen for changes
  useEffect(() => {
    const initAuth = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (!error && data.user) {
        const u = data.user
        const username =
          (u.user_metadata && (u.user_metadata.username as string)) ||
          deriveUsername(u.email ?? null)

        setCurrentUser({
          id: u.id,
          email: u.email ?? '',
          username,
        })
      }
    }

    initAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user
      if (u) {
        const username =
          (u.user_metadata && (u.user_metadata.username as string)) ||
          deriveUsername(u.email ?? null)

        setCurrentUser({
          id: u.id,
          email: u.email ?? '',
          username,
        })
      } else {
        setCurrentUser(null)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Ensure index is valid when tab changes
  useEffect(() => {
    const list = ALL_VIDEOS.filter(v =>
      activeTab === 'trending' ? v.category === 'TRENDING' : v.category === 'YOUR'
    )
    if (currentIndex >= list.length) {
      setCurrentIndex(0)
    }
  }, [activeTab, currentIndex])

  const handleAuthSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setAuthError(null)
    setAuthSuccess(null)

    const trimmedEmail = emailInput.trim()
    const trimmedPass = passwordInput.trim()

    if (!trimmedEmail || !trimmedPass) {
      setAuthError('Enter both an email and password.')
      return
    }

    setAuthLoading(true)
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPass,
          options: {
            data: {
              username: deriveUsername(trimmedEmail),
            },
          },
        })

        if (error) {
          setAuthError(error.message)
          return
        }

        const u = data.user
        if (u) {
          const username =
            (u.user_metadata && (u.user_metadata.username as string)) ||
            deriveUsername(u.email ?? null)

          setCurrentUser({
            id: u.id,
            email: u.email ?? '',
            username,
          })
          setAuthSuccess(
            'Account created. If email confirmation is enabled, please confirm before logging in from a new device.'
          )
        } else {
          setAuthSuccess(
            'Sign-up request sent. Check your email if confirmation is required.'
          )
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPass,
        })

        if (error) {
          setAuthError(error.message)
          return
        }

        const u = data.user
        if (u) {
          const username =
            (u.user_metadata && (u.user_metadata.username as string)) ||
            deriveUsername(u.email ?? null)

          setCurrentUser({
            id: u.id,
            email: u.email ?? '',
            username,
          })
          setAuthSuccess('Welcome back! You are now signed in.')
        }
      }

      setEmailInput('')
      setPasswordInput('')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setCurrentUser(null)
    setAuthSuccess('You have been logged out.')
  }

  const toggleLike = (videoId: string) => {
    if (!currentUser) {
      setAuthError('You need to be logged in to like videos.')
      setAuthSuccess(null)
      return
    }

    const username = currentUser.username
    const existingForUser = userLikes[username] ?? []
    const hasLiked = existingForUser.includes(videoId)

    const newUserLikes: UserLikesState = {
      ...userLikes,
      [username]: hasLiked
        ? existingForUser.filter(id => id !== videoId)
        : [...existingForUser, videoId],
    }

    const currentCount = likes[videoId] ?? 0
    const newLikes: LikesState = {
      ...likes,
      [videoId]: hasLiked ? Math.max(0, currentCount - 1) : currentCount + 1,
    }

    setUserLikes(newUserLikes)
    setLikes(newLikes)
  }

  const handleAddComment = (videoId: string, text: string) => {
    if (!currentUser) {
      setAuthError('You need to be logged in to comment.')
      setAuthSuccess(null)
      return
    }

    const trimmed = text.trim()
    if (!trimmed) return

    const newComment: Comment = {
      id: `${videoId}-${Date.now()}`,
      videoId,
      author: currentUser.username,
      text: trimmed,
      createdAt: new Date().toISOString(),
    }

    setComments(prev => [...prev, newComment])
  }

  const likesForVideo = (videoId: string) => likes[videoId] ?? 0

  const commentsForVideo = (videoId: string) =>
    comments
      .filter(c => c.videoId === videoId)
      .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))

  const userHasLiked = (videoId: string) => {
    if (!currentUser) return false
    const list = userLikes[currentUser.username] ?? []
    return list.includes(videoId)
  }

  const totalLikesByUser = (username: string) => {
    const list = userLikes[username] ?? []
    return list.length
  }

  const totalCommentsByUser = (username: string) =>
    comments.filter(c => c.author === username).length

  const cycleVideo = (direction: 1 | -1) => {
    setCurrentIndex(prev => {
      const list = ALL_VIDEOS.filter(v =>
        activeTab === 'trending' ? v.category === 'TRENDING' : v.category === 'YOUR'
      )
      const len = list.length || 1
      const next = (prev + direction + len) % len
      return next
    })
  }

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) < 30) return
    if (e.deltaY > 0 && activeTab === 'trending') {
      setActiveTab('your')
    } else if (e.deltaY < 0 && activeTab === 'your') {
      setActiveTab('trending')
    }
  }

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return
    const start = touchStartRef.current
    const touch = e.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y

    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (absDy > absDx && absDy > 40) {
      // vertical swipe switches tab
      if (dy > 0 && activeTab === 'your') {
        setActiveTab('trending')
      } else if (dy < 0 && activeTab === 'trending') {
        setActiveTab('your')
      }
    } else if (absDx > 40) {
      // horizontal swipe changes video
      if (dx < 0) {
        cycleVideo(1)
      } else {
        cycleVideo(-1)
      }
    }

    touchStartRef.current = null
  }

  const handleAvatarButtonClick = () => {
    if (!currentUser) return
    avatarInputRef.current?.click()
  }

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!currentUser) return
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setAvatars(prev => ({
        ...prev,
        [currentUser.id]: dataUrl,
      }))
    }
    reader.readAsDataURL(file)
  }

  const currentList = ALL_VIDEOS.filter(v =>
    activeTab === 'trending' ? v.category === 'TRENDING' : v.category === 'YOUR'
  )
  const currentVideo = currentList[currentIndex] ?? currentList[0] ?? null

  const currentAvatar =
    currentUser && avatars[currentUser.id] ? avatars[currentUser.id] : null

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">WOW</div>
          <div>
            <div className="brand-title">WowFinal Studio</div>
            <div className="brand-subtitle">Your tiny but mighty video universe</div>
          </div>
        </div>

        <div className="auth-card">
          {currentUser ? (
            <>
              <div className="auth-hello">
                <span className="dot-online" aria-hidden="true" />
                Signed in as <strong>{currentUser.username}</strong>
              </div>
              <button className="btn ghost" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <div className="auth-toggle">
                <button
                  type="button"
                  className={authMode === 'login' ? 'chip chip-active' : 'chip'}
                  onClick={() => {
                    setAuthMode('login')
                    setAuthError(null)
                    setAuthSuccess(null)
                  }}
                >
                  Log in
                </button>
                <button
                  type="button"
                  className={authMode === 'signup' ? 'chip chip-active' : 'chip'}
                  onClick={() => {
                    setAuthMode('signup')
                    setAuthError(null)
                    setAuthSuccess(null)
                  }}
                >
                  Sign up
                </button>
              </div>
              <div className="auth-fields">
                <input
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  type="email"
                />
                <input
                  type="password"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  placeholder="Password"
                  autoComplete={
                    authMode === 'login' ? 'current-password' : 'new-password'
                  }
                />
              </div>
              <button className="btn primary" type="submit" disabled={authLoading}>
                {authLoading
                  ? authMode === 'login'
                    ? 'Logging in...'
                    : 'Signing up...'
                  : authMode === 'login'
                  ? 'Enter'
                  : 'Create account'}
              </button>
            </form>
          )}
        </div>
      </header>

      <main className="app-main">
        <section className="hero">
          <div>
            <h1>
              Watch, like &amp; comment on your
              <span className="hero-highlight"> wowfinalfinal </span>
              creations.
            </h1>
            <p>
              Swipe or click to browse your neon-green universe. One video at a time, fully
              focused and responsive on any screen.
            </p>
            <div className="hero-badges">
              <span className="pill">🔥 Trending &amp; Personal tabs</span>
              <span className="pill">👆 Tap left / right to switch videos</span>
              <span className="pill">⬆⬇ Scroll / swipe to change tab</span>
            </div>
          </div>
          <div className="hero-card">
            <div className="hero-card-inner">
              <div className="hero-card-header">
                <span className="hero-dot" />
                <span className="hero-dot" />
                <span className="hero-dot" />
              </div>
              <div className="hero-card-body profile-hero-card">
                <div className="profile-avatar-block">
                  <div className="profile-avatar-wrapper">
                    {currentAvatar ? (
                      <img
                        src={currentAvatar}
                        alt="Profile avatar"
                        className="profile-avatar-image"
                      />
                    ) : (
                      <div className="profile-avatar-placeholder">
                        {currentUser
                          ? currentUser.username[0]?.toUpperCase()
                          : '🙂'}
                      </div>
                    )}
                  </div>
                  {currentUser && (
                    <>
                      <button
                        type="button"
                        className="btn primary btn-avatar"
                        onClick={handleAvatarButtonClick}
                      >
                        {currentAvatar ? 'Change avatar' : 'Add avatar'}
                      </button>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleAvatarChange}
                      />
                    </>
                  )}
                  {!currentUser && (
                    <p className="profile-hint">
                      Sign in to set your profile picture and see your neon stats.
                    </p>
                  )}
                </div>
                <div className="profile-meta-block">
                  <h2>Creator profile</h2>
                  {currentUser ? (
                    <>
                      <p className="profile-username">@{currentUser.username}</p>
                      <div className="profile-stats">
                        <div>
                          <span className="profile-stat-label">Likes given</span>
                          <span className="profile-stat-value">
                            {totalLikesByUser(currentUser.username)}
                          </span>
                        </div>
                        <div>
                          <span className="profile-stat-label">Comments</span>
                          <span className="profile-stat-value">
                            {totalCommentsByUser(currentUser.username)}
                          </span>
                        </div>
                      </div>
                      <p className="profile-caption">
                        Your identity glows in neon green. Upload an avatar and start leaving
                        your mark on every wowfinalfinal.
                      </p>
                    </>
                  ) : (
                    <p className="profile-caption">
                      Log in or sign up to unlock your personal neon profile – complete with
                      stats and a custom avatar (auth powered by Supabase).
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="tabs-section">
          <div className="tabs-header">
            <div className="tabs-switch">
              <button
                type="button"
                className={activeTab === 'trending' ? 'tab-btn active' : 'tab-btn'}
                onClick={() => setActiveTab('trending')}
              >
                Trending
              </button>
              <button
                type="button"
                className={activeTab === 'your' ? 'tab-btn active' : 'tab-btn'}
                onClick={() => setActiveTab('your')}
              >
                Your videos
              </button>
            </div>
            <p className="tabs-caption">
              {activeTab === 'trending'
                ? 'Scroll or swipe down for your personal cuts.'
                : 'Scroll or swipe up to jump back to trending.'}
            </p>
          </div>

          <div
            className="viewer-shell"
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {currentVideo && (
              <VideoCard
                key={currentVideo.id}
                video={currentVideo}
                likeCount={likesForVideo(currentVideo.id)}
                hasLiked={userHasLiked(currentVideo.id)}
                onToggleLike={() => toggleLike(currentVideo.id)}
                comments={commentsForVideo(currentVideo.id)}
                onAddComment={text => handleAddComment(currentVideo.id, text)}
                isLoggedIn={!!currentUser}
                onNext={() => cycleVideo(1)}
                onPrev={() => cycleVideo(-1)}
                index={currentIndex}
                total={currentList.length}
              />
            )}
          </div>
        </section>

        <div className="auth-messages">
          {authError && <div className="auth-error">{authError}</div>}
          {authSuccess && <div className="auth-success">{authSuccess}</div>}
        </div>
      </main>

      <footer className="app-footer">
        <span>Built with 🤍 just for your wowfinalfinal universe. Auth by Supabase.</span>
      </footer>
    </div>
  )
}

interface VideoCardProps {
  video: Video
  likeCount: number
  hasLiked: boolean
  onToggleLike: () => void
  comments: Comment[]
  onAddComment: (text: string) => void
  isLoggedIn: boolean
  onNext: () => void
  onPrev: () => void
  index: number
  total: number
}

function VideoCard({
  video,
  likeCount,
  hasLiked,
  onToggleLike,
  comments,
  onAddComment,
  isLoggedIn,
  onNext,
  onPrev,
  index,
  total,
}: VideoCardProps) {
  const [commentInput, setCommentInput] = useState('')
  const [showComments, setShowComments] = useState(true)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!commentInput.trim()) return
    onAddComment(commentInput)
    setCommentInput('')
  }

  const handleMediaClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const clickX = e.clientX - rect.left
    if (clickX < rect.width / 2) {
      onPrev()
    } else {
      onNext()
    }
  }

  return (
    <article className="video-card viewer-card">
      <div className="viewer-meta-row">
        <span className="viewer-label">Now playing</span>
        <span className="viewer-index">
          {index + 1} / {total}
        </span>
      </div>

      <div className="video-media-outer">
        <div className="video-media-wrapper" onClick={handleMediaClick}>
          <video
            className="video-player"
            src={video.url}
            controls
            preload="metadata"
          >
            Sorry, your browser does not support embedded videos.
          </video>
          <div className="video-click-overlay">
            <span className="overlay-hint overlay-left">⟵ Prev</span>
            <span className="overlay-hint overlay-right">Next ⟶</span>
          </div>
        </div>
      </div>

      <div className="video-meta">
        <h2>{video.title}</h2>
        <p>{video.description}</p>
      </div>

      <div className="video-actions">
        <button
          type="button"
          className={hasLiked ? 'like-button liked' : 'like-button'}
          onClick={onToggleLike}
          disabled={!isLoggedIn}
        >
          <span className="heart" aria-hidden="true">
            {hasLiked ? '♥' : '♡'}
          </span>
          <span>{likeCount}</span>
          <span className="like-label">likes</span>
        </button>

        <button
          type="button"
          className="btn ghost small"
          onClick={() => setShowComments(prev => !prev)}
        >
          {showComments ? 'Hide comments' : 'Show comments'}
        </button>
      </div>

      {showComments && (
        <div className="comments-section">
          <form className="comment-form" onSubmit={handleSubmit}>
            <input
              value={commentInput}
              onChange={e => setCommentInput(e.target.value)}
              placeholder={isLoggedIn ? 'Drop a comment…' : 'Log in to comment'}
              disabled={!isLoggedIn}
            />
            <button className="btn primary small" type="submit" disabled={!isLoggedIn}>
              Send
            </button>
          </form>

          <ul className="comment-list">
            {comments.length === 0 && (
              <li className="comment empty">No comments yet. Be the first!</li>
            )}
            {comments.map(c => (
              <li key={c.id} className="comment">
                <div className="comment-avatar">{c.author[0]?.toUpperCase()}</div>
                <div className="comment-body">
                  <div className="comment-header">
                    <span className="comment-author">{c.author}</span>
                    <span className="comment-time">
                      {new Date(c.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p>{c.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

export default App
