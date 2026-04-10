'use client';

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Lock, User } from "lucide-react";

export function AuthGate() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  async function handleCredentialsLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!username || !password) {
      return;
    }

    setIsLoggingIn(true);
    setAuthError("");

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        setAuthError("Invalid username or password");
      } else {
        setUsername("");
        setPassword("");
      }
    } catch {
      setAuthError("An error occurred during login");
    } finally {
      setIsLoggingIn(false);
    }
  }

  return (
    <div className="login-gate">
      <div className="login-gate-content">
        <div className="logo centered">
          <span className="logo-icon">⚡</span>
          <h1>
            LeadScraper <span className="pro">Pro</span>
          </h1>
        </div>
        <div className="card login-card">
          <div className="card-header">
            <h2>Welcome Back</h2>
          </div>
          <p className="card-desc">
            Enter your account credentials to access the scraper dashboard.
          </p>

          <form className="login-gate-form" onSubmit={handleCredentialsLogin}>
            <div className="input-group">
              <span className="input-icon">
                <User size={20} />
              </span>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <span className="input-icon">
                <Lock size={20} />
              </span>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {authError ? <div className="gate-error">{authError}</div> : null}

            <button type="submit" className="btn-start" disabled={isLoggingIn}>
              <span className="btn-text">
                {isLoggingIn ? "Verifying..." : "Sign In to Portal"}
              </span>
            </button>
          </form>
        </div>
        <p className="login-footer">Private System &copy; 2026 LeadScraper Pro</p>
      </div>
    </div>
  );
}
